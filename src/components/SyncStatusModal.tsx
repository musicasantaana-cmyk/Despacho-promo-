import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { RefreshCw, Wifi, WifiOff, Server, Smartphone, Clock, ShieldCheck, Check, Layers, Cpu, Radio } from 'lucide-react';

interface SyncStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SyncStatusModal: React.FC<SyncStatusModalProps> = ({ isOpen, onClose }) => {
  const { syncStatus, syncNow, setLatencyInterval, state } = useAppContext();
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);

  if (!isOpen) return null;

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    await syncNow();
    setTimeout(() => {
      setIsManualSyncing(false);
      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 2500);
    }, 400);
  };

  const intervals = [
    { label: '5 segundos (Alta frecuencia)', value: 5 },
    { label: '10 segundos (Rápido)', value: 10 },
    { label: '15 segundos (Predeterminado / Óptimo)', value: 15 },
    { label: '30 segundos (Ahorro de datos)', value: 30 },
    { label: '60 segundos (Bajo consumo)', value: 60 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Radio className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">Puerta de Enlace y Protocolo de Sincronización</h3>
                <p className="text-xs text-slate-400">Arquitectura Multi-Dispositivo & Sincronización Central</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
          {/* Status Banner */}
          <div className={`p-4 rounded-xl border flex items-center justify-between ${
            syncStatus.isOnline 
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' 
              : 'bg-red-50 border-red-200 text-red-900'
          }`}>
            <div className="flex items-center space-x-3">
              {syncStatus.isOnline ? (
                <div className="h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
              ) : (
                <WifiOff className="h-5 w-5 text-red-500" />
              )}
              <div>
                <div className="font-semibold text-sm">
                  {syncStatus.isOnline ? 'Puerta de Enlace Activa y Conectada' : 'Modo Fuera de Línea'}
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  {syncStatus.isOnline 
                    ? `Latencia de actualización configurada a ${syncStatus.latencyInterval}s (Heartbeat protocol)`
                    : 'Los cambios se guardan localmente y se sincronizarán al reconectar.'}
                </div>
              </div>
            </div>
            <button
              onClick={handleManualSync}
              disabled={isManualSyncing}
              className="flex items-center px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isManualSyncing ? 'animate-spin' : ''}`} />
              {isManualSyncing ? 'Sincronizando...' : 'Sincronizar Ya'}
            </button>
          </div>

          {successMsg && (
            <div className="bg-emerald-500 text-white text-xs px-3 py-2 rounded-lg flex items-center justify-center font-medium shadow-xs">
              <Check className="h-4 w-4 mr-1.5" /> Sincronización completada con la base de datos central
            </div>
          )}

          {/* Grid Information */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="flex items-center text-xs font-medium text-slate-500 mb-1">
                <Smartphone className="h-3.5 w-3.5 mr-1 text-slate-400" /> ID de este Dispositivo
              </div>
              <div className="font-mono font-bold text-slate-800 text-sm">{syncStatus.deviceId}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Identificador único de nodo</div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="flex items-center text-xs font-medium text-slate-500 mb-1">
                <Server className="h-3.5 w-3.5 mr-1 text-slate-400" /> Versión Central
              </div>
              <div className="font-mono font-bold text-slate-800 text-sm">v{syncStatus.serverVersion}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Revisiones acumuladas</div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="flex items-center text-xs font-medium text-slate-500 mb-1">
                <Clock className="h-3.5 w-3.5 mr-1 text-slate-400" /> Última Sincronización
              </div>
              <div className="font-semibold text-slate-800 text-sm">
                {syncStatus.lastSyncTime || 'Pendiente'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Auto-refresco cada {syncStatus.latencyInterval}s</div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="flex items-center text-xs font-medium text-slate-500 mb-1">
                <Layers className="h-3.5 w-3.5 mr-1 text-slate-400" /> Registros Globales
              </div>
              <div className="font-semibold text-slate-800 text-sm">
                {state.employees.length} pers. / {state.routes.length} rutas
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">{state.assignments.length} asignaciones totales</div>
            </div>
          </div>

          {/* Latency / Protocol Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Configuración de Rango de Latencia de Actualización (Polling Gateway)
            </label>
            <p className="text-xs text-slate-500">
              Controla el intervalo de consulta periódica con el que este dispositivo sincroniza novedades generadas desde otros terminales:
            </p>
            <select
              value={syncStatus.latencyInterval}
              onChange={(e) => setLatencyInterval(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-medium bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              {intervals.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Protocol Architecture Explanation */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs text-slate-600">
            <div className="font-bold text-slate-800 flex items-center">
              <ShieldCheck className="h-4 w-4 text-emerald-600 mr-1.5" />
              Protocolo de Comunicación Multi-Dispositivo:
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-600 leading-relaxed">
              <li><strong>Puerta de Enlace REST Gateway:</strong> Punto central en `/api/sync` con persistencia en disco y control de versiones atómicas.</li>
              <li><strong>Latencia Programada (15s):</strong> Cada 15 segundos se ejecuta un ciclo ligero de comprobación de versión (*Heartbeat*) para descargar cambios remotos sin recargar.</li>
              <li><strong>Envío Inmediato:</strong> Cualquier cambio local se transmite al instante para que otros dispositivos lo visualicen en su siguiente ciclo de 15s.</li>
              <li><strong>Canal Broadcast Inter-Pestañas:</strong> Sincronización instantánea (0ms) entre navegadores o pestañas dentro del mismo equipo.</li>
            </ul>
          </div>
        </div>

        <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
