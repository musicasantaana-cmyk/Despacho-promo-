import React, { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onExport: (startDate: string, endDate: string) => void;
  title?: string;
}

export const DateRangeExportModal: React.FC<Props> = ({ isOpen, onClose, onExport, title = 'Exportar Reporte' }) => {
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col">
        <div className="p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
          <p className="text-sm text-slate-500 mt-1">Seleccione el rango de fechas para el reporte.</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Fecha Inicio</label>
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Fecha Fin</label>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end p-4 border-t border-slate-100 gap-3 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button 
            onClick={() => {
              onExport(startDate, endDate);
              onClose();
            }} 
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
          >
            Descargar CSV
          </button>
        </div>
      </div>
    </div>
  );
};
