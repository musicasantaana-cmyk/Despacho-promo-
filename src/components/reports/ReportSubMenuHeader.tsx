import React, { useState, useRef, useEffect } from 'react';
import { Layers, MoreVertical, Download, MapPin } from 'lucide-react';
import { WorkGroup, RouteDef } from '../../types';

interface Props {
  workGroups: WorkGroup[];
  selectedGroupIds: string[];
  onToggleGroup: (id: string) => void;
  onSelectAllGroups: () => void;
  routes?: RouteDef[];
  selectedRouteIds?: string[];
  onToggleRoute?: (id: string) => void;
  onSelectAllRoutes?: () => void;
  onExportCsv?: () => void;
  children?: React.ReactNode;
}

export const ReportSubMenuHeader: React.FC<Props> = ({
  workGroups, selectedGroupIds, onToggleGroup, onSelectAllGroups,
  routes, selectedRouteIds = [], onToggleRoute, onSelectAllRoutes,
  onExportCsv, children
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4 relative mb-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        {/* Work Group Filter */}
        <div className="flex-1 w-full">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center">
              <Layers className="h-4 w-4 mr-1.5 text-slate-400" /> Filtro de Grupos
            </span>
            <button
              onClick={onSelectAllGroups}
              className={`text-xs font-bold transition-colors ${
                selectedGroupIds.length === 0 ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {selectedGroupIds.length === 0 ? '✓ Todos los grupos' : 'Seleccionar todos'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {workGroups.map(wg => {
              const isSelected = selectedGroupIds.includes(wg.id);
              return (
                <button
                  key={wg.id}
                  onClick={() => onToggleGroup(wg.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    isSelected
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {wg.name}
                </button>
              );
            })}
          </div>
        </div>

        {children && (
          <div className="flex-1 w-full sm:w-auto">
            {children}
          </div>
        )}

        <div className="relative self-end sm:self-center shrink-0" ref={menuRef}>
          <button 
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors flex items-center justify-center bg-slate-50 border border-slate-200 shadow-sm"
          >
            <MoreVertical className="h-5 w-5 text-slate-600" />
          </button>
          
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1">
              {onExportCsv && (
                <button 
                  onClick={() => { onExportCsv(); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center font-medium"
                >
                  <Download className="h-4 w-4 mr-2 text-slate-400" /> Descargar Reporte
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Multi-Route Selector Filter */}
      {routes && routes.length > 0 && onToggleRoute && onSelectAllRoutes && (
        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center">
              <MapPin className="h-4 w-4 mr-1.5 text-emerald-500" /> Filtro por Ruta(s) Base
            </span>
            <button
              onClick={onSelectAllRoutes}
              className={`text-xs font-bold transition-colors ${
                selectedRouteIds.length === 0 ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {selectedRouteIds.length === 0 ? '✓ Todas las rutas' : 'Ver todas'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1 scrollbar-hide">
            {routes.map(r => {
              const isSelected = selectedRouteIds.includes(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => onToggleRoute(r.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-amber-50 text-amber-900 border-amber-300 shadow-sm ring-1 ring-amber-400'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="font-mono text-[10px] bg-slate-800 text-white px-1.5 py-0.5 rounded">{r.code || 'R'}</span>
                  <span>{r.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

