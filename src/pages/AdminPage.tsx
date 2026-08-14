import React, { useState, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Users, Truck, MapPin, Plus, Trash2, X, Settings, Download, UploadCloud, Shield, Phone, MessageCircle, User, UserCog, Filter, HardHat, Edit2 } from 'lucide-react';
import { Employee, Vehicle, RouteDef } from '../types';
import { downloadCsvTemplate, parseCsvFile } from '../utils/csvHelper';
import { exportToCsv } from '../utils/exportCsv';

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[85vh] md:max-h-[90vh]">
        <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50 shrink-0 rounded-t-2xl">
          <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto overscroll-y-contain touch-pan-y">
          {children}
        </div>
      </div>
    </div>
  );
};

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message }: { isOpen: boolean, onClose: () => void, onConfirm: () => void, title: string, message: string }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col">
        <div className="p-5">
          <h3 className="font-bold text-slate-800 text-lg mb-2">{title}</h3>
          <p className="text-sm text-slate-600">{message}</p>
        </div>
        <div className="flex justify-end p-4 border-t border-slate-100 gap-3 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors">Cancelar</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors">Eliminar</button>
        </div>
      </div>
    </div>
  );
};

export const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'employees' | 'vehicles' | 'routes' | 'general'>('employees');
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  
  return (
    <div className="flex flex-col space-y-6">
      {/* Tabs */}
      <div className="flex justify-between items-center w-full bg-slate-100 p-1 rounded-xl">
        <div className="flex space-x-1 overflow-x-auto whitespace-nowrap flex-1 pb-1 md:pb-0 scrollbar-hide overscroll-x-contain touch-pan-x">
          <button
            onClick={() => setActiveTab('employees')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'employees' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Personal</span>
          </button>
          <button
            onClick={() => setActiveTab('vehicles')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'vehicles' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Truck className="h-4 w-4" />
            <span>Vehículos</span>
          </button>
          <button
            onClick={() => setActiveTab('routes')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'routes' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <MapPin className="h-4 w-4" />
            <span>Rutas Base</span>
          </button>
          <button
            onClick={() => setActiveTab('general')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'general' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Shield className="h-4 w-4" />
            <span>General</span>
          </button>
        </div>
        
        <button 
          onClick={() => setIsBulkModalOpen(true)}
          className="p-2 ml-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-200 bg-white rounded-lg transition-colors border border-slate-200 shadow-sm"
          title="Importar/Exportar Datos"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'employees' && <EmployeesTab />}
        {activeTab === 'vehicles' && <VehiclesTab />}
        {activeTab === 'routes' && <RoutesTab />}
      </div>

      <BulkActionModal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} />
    </div>
  );
};

const GeneralTab = () => {
  const { state, addWorkGroup, deleteWorkGroup } = useAppContext();
  const [newGroup, setNewGroup] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroup) return;
    addWorkGroup(newGroup);
    setNewGroup('');
  };

  return (
    <div className="max-w-2xl">
      <h3 className="font-semibold text-slate-800 mb-2">Áreas y Grupos de Trabajo</h3>
      <p className="text-sm text-slate-500 mb-6">Administre los grupos operativos. Toda la asignación de personal, vehículos y rutas quedará segmentada de acuerdo al grupo de trabajo seleccionado en la barra superior.</p>

      <form onSubmit={handleAdd} className="flex gap-3 mb-8">
        <input 
          type="text" 
          required
          value={newGroup}
          onChange={e => setNewGroup(e.target.value)}
          placeholder="Nombre del nuevo grupo operativo..."
          className="flex-1 border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <button type="submit" className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 flex items-center">
          <Plus className="h-4 w-4 mr-2" /> Crear Grupo
        </button>
      </form>

      <div className="grid gap-3">
        {state.workGroups.map(wg => (
          <div key={wg.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center font-bold">
                {wg.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium text-slate-800">{wg.name}</span>
            </div>
            <button onClick={() => deleteWorkGroup(wg.id)} className="text-slate-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {state.workGroups.length === 0 && (
          <div className="p-8 text-center text-slate-500 border border-dashed border-slate-300 rounded-xl">
            No hay grupos de trabajo registrados.
          </div>
        )}
      </div>
    </div>
  );
};

const BulkActionModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const { state, addEmployee, addVehicle } = useAppContext();
  const [bulkType, setBulkType] = useState<'employees' | 'vehicles'>('employees');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!state.activeWorkGroupId) {
      alert("Atención: Debe seleccionar un Grupo de Trabajo activo en la barra superior antes de importar registros.");
      return;
    }

    try {
      const data = await parseCsvFile(file);
      if (bulkType === 'employees') {
        data.forEach(row => {
          addEmployee({
            name: `${row.nombre || ''} ${row.apellido || ''}`.trim() || 'Sin Nombre',
            role: (row.rol as any) || 'Conductor',
            phone: row.telefono || '',
            workGroup: '',
          });
        });
      } else {
        data.forEach(row => {
          addVehicle({
            plate: row.placa || 'N/A',
            internalNumber: row.numero_movil || row.numero_interno || '',
            capacity: Number(row.capacidad) || 0,
            status: 'Operativo'
          });
        });
      }
      alert(`Se importaron ${data.length} registros exitosamente al grupo actual.`);
      onClose();
    } catch (err) {
      alert("Error leyendo el archivo. Asegúrese de usar la plantilla correcta (.csv o .xlsx).");
    }
  };

  const handleExport = () => {
    if (bulkType === 'employees') {
      const data = state.employees
        .filter(e => e.workGroupId === state.activeWorkGroupId)
        .map(e => ({ Nombre: e.name, Rol: e.role, Telefono: e.phone }));
      exportToCsv(`personal_exportado.csv`, data);
    } else {
      const data = state.vehicles
        .filter(v => v.workGroupId === state.activeWorkGroupId)
        .map(v => ({ Placa: v.plate, Numero_Movil: v.internalNumber, Capacidad: v.capacity, Estado: v.status }));
      exportToCsv(`vehiculos_exportados.csv`, data);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gestión Masiva de Datos">
      <div className="space-y-6">
        {/* Toggle Type */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button 
            onClick={() => setBulkType('employees')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${bulkType === 'employees' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
          >
            Personal
          </button>
          <button 
            onClick={() => setBulkType('vehicles')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${bulkType === 'vehicles' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
          >
            Vehículos
          </button>
        </div>

        <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl">
          <h4 className="text-sm font-bold text-blue-800 mb-1">Importante</h4>
          <p className="text-xs text-blue-600 leading-relaxed">
            Las importaciones masivas se asignarán automáticamente al grupo de trabajo actualmente seleccionado en la barra superior: 
            <strong className="block mt-1">{state.workGroups.find(g => g.id === state.activeWorkGroupId)?.name || 'Ningún grupo seleccionado'}</strong>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => downloadCsvTemplate(bulkType)}
            className="flex flex-col items-center justify-center p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
          >
            <Download className="h-6 w-6 text-slate-400 group-hover:text-indigo-500 mb-2" />
            <span className="text-sm font-medium text-slate-700">1. Bajar Plantilla</span>
          </button>
          <button 
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center p-4 border border-slate-200 rounded-xl hover:border-emerald-300 hover:bg-emerald-50 transition-colors group"
          >
            <UploadCloud className="h-6 w-6 text-slate-400 group-hover:text-emerald-500 mb-2" />
            <span className="text-sm font-medium text-slate-700">2. Subir Archivo</span>
          </button>
          <input type="file" accept=".csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" className="hidden" ref={fileRef} onChange={handleFileChange} />
        </div>

        <div className="pt-4 border-t border-slate-100">
          <button 
            onClick={handleExport}
            className="w-full flex items-center justify-center bg-slate-50 border border-slate-200 text-slate-700 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-100 transition-colors"
          >
            Exportar datos actuales del grupo
          </button>
        </div>
      </div>
    </Modal>
  );
};

const EmployeesTab = () => {
  const { state, addEmployee, updateEmployee, deleteEmployee } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('Todos');
  const [form, setForm] = useState<Omit<Employee, 'id'>>({ name: '', role: 'Conductor', phone: '', workGroup: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const activeGroupEmps = state.employees.filter(e => {
    if (e.workGroupId !== state.activeWorkGroupId) return false;
    if (roleFilter === 'Todos') return true;
    
    const empRole = (e.role || '').toLowerCase();
    const filterNorm = roleFilter.toLowerCase();
    
    if (filterNorm === 'conductor' && empRole.includes('conductor')) return true;
    if (filterNorm === 'auxiliar' && (empRole.includes('ayudante') || empRole.includes('auxiliar'))) return true;
    if (filterNorm === 'coordinador' && empRole.includes('coordinador')) return true;
    
    return false;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone || !state.activeWorkGroupId) return;
    
    if (editingId) {
      updateEmployee(editingId, form);
    } else {
      addEmployee(form);
    }
    
    setForm({ name: '', role: 'Conductor', phone: '', workGroup: '' });
    setEditingId(null);
    setIsModalOpen(false);
  };

  const handleEdit = (emp: Employee) => {
    setForm({ name: emp.name, role: emp.role, phone: emp.phone, workGroup: emp.workGroup });
    setEditingId(emp.id);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteEmployee(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const openNewModal = () => {
    setForm({ name: '', role: 'Conductor', phone: '', workGroup: '' });
    setEditingId(null);
    setIsModalOpen(true);
  };

  if (!state.activeWorkGroupId) {
    return <ContextRequiredMessage />;
  }

  const getRoleIcon = (rawRole: string) => {
    const role = (rawRole || '').toLowerCase().trim();
    if (role.includes('conductor')) return <Truck className="h-5 w-5 text-indigo-500" title="Conductor" />;
    if (role.includes('ayudante') || role.includes('auxiliar')) return <HardHat className="h-5 w-5 text-emerald-500" title="Auxiliar / Ayudante" />;
    if (role.includes('coordinador')) return <UserCog className="h-5 w-5 text-amber-500" title="Coordinador" />;
    return <User className="h-5 w-5 text-slate-500" title={rawRole || 'Usuario'} />;
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h3 className="font-semibold text-slate-800">Directorio de Personal</h3>
        
        <div className="flex w-full md:w-auto items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded-lg p-1 w-full md:w-auto overflow-x-auto scrollbar-hide">
            {['Todos', 'Conductor', 'Auxiliar', 'Coordinador'].map(role => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  roleFilter === role ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {role}
              </button>
            ))}
          </div>

          <button 
            onClick={openNewModal}
            className="bg-indigo-600 shrink-0 text-white rounded-lg p-2 md:px-4 md:py-2 text-sm font-medium hover:bg-indigo-700 flex items-center shadow-sm"
          >
            <Plus className="h-5 w-5 md:mr-2" />
            <span className="hidden md:inline">Nuevo</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wider">
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 font-medium rounded-tl-lg w-12 text-center">Rol</th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium text-center">Contacto</th>
              <th className="px-4 py-3 font-medium rounded-tr-lg text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-sm">
            {activeGroupEmps.map(emp => (
              <tr key={emp.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex justify-center bg-slate-100 p-2 rounded-lg w-8 h-8 mx-auto">
                    {getRoleIcon(emp.role)}
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">{emp.name}</td>
                <td className="px-4 py-3">
                  <div className="flex space-x-3 justify-center">
                    <a href={`tel:${emp.phone}`} className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors" title="Llamar">
                      <Phone className="h-4 w-4" />
                    </a>
                    <a href={`https://wa.me/${emp.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-colors" title="WhatsApp">
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end space-x-1">
                    <button onClick={() => handleEdit(emp)} className="text-indigo-500 hover:text-indigo-700 p-2 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(emp.id)} className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {activeGroupEmps.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  {state.employees.filter(e => e.workGroupId === state.activeWorkGroupId).length === 0 
                    ? "No hay personal registrado en este grupo"
                    : "No hay resultados para el filtro seleccionado"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Editar Personal" : "Registrar Personal"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nombre Completo</label>
            <input required type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Rol</label>
            <select value={form.role} onChange={e => setForm({...form, role: e.target.value as any})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="Conductor">Conductor</option>
              <option value="Ayudante">Ayudante</option>
              <option value="Coordinador">Coordinador</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Teléfono</label>
            <input required type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="pt-2">
            <button type="submit" className="w-full bg-indigo-600 text-white rounded-lg py-3 text-sm font-bold hover:bg-indigo-700 flex justify-center items-center shadow-md">
              {editingId ? "Actualizar Datos" : "Guardar Personal"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={confirmDelete}
        title="Eliminar Personal"
        message="¿Está seguro de eliminar este registro? Esta acción no se puede deshacer."
      />
    </div>
  );
};

const VehiclesTab = () => {
  const { state, addVehicle, updateVehicle, deleteVehicle } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Vehicle, 'id'>>({ plate: '', internalNumber: '', capacity: 0, status: 'Operativo' });

  const activeGroupVehicles = state.vehicles.filter(v => v.workGroupId === state.activeWorkGroupId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.plate || !state.activeWorkGroupId) return;
    
    if (editingId) {
      updateVehicle(editingId, form);
    } else {
      addVehicle(form);
    }
    
    setForm({ plate: '', internalNumber: '', capacity: 0, status: 'Operativo' });
    setEditingId(null);
    setIsModalOpen(false);
  };

  const handleEdit = (veh: Vehicle) => {
    setForm({ plate: veh.plate, internalNumber: veh.internalNumber, capacity: veh.capacity, status: veh.status, workGroup: veh.workGroup });
    setEditingId(veh.id);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteVehicle(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const openNewModal = () => {
    setForm({ plate: '', internalNumber: '', capacity: 0, status: 'Operativo' });
    setEditingId(null);
    setIsModalOpen(true);
  };

  if (!state.activeWorkGroupId) {
    return <ContextRequiredMessage />;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-semibold text-slate-800">Flota Vehicular</h3>
        <button 
          onClick={openNewModal}
          className="bg-indigo-600 text-white rounded-lg p-2 md:px-4 md:py-2 text-sm font-medium hover:bg-indigo-700 flex items-center shadow-sm"
        >
          <Plus className="h-5 w-5 md:mr-2" />
          <span className="hidden md:inline">Nuevo Vehículo</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeGroupVehicles.map(veh => (
          <div key={veh.id} className="border border-slate-200 rounded-xl p-4 flex flex-col bg-slate-50 hover:border-slate-300 transition-colors">
            <div className="flex justify-between items-start w-full">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Móvil</p>
                <h4 className="font-bold text-indigo-700 text-2xl mb-1">{veh.internalNumber || 'N/A'}</h4>
                <p className="text-sm text-slate-600 uppercase"><span className="font-medium">{veh.plate}</span></p>
              </div>
              <div className="flex space-x-1">
                <button onClick={() => handleEdit(veh)} className="text-indigo-400 hover:text-indigo-600 p-1.5 bg-white rounded-lg shadow-sm border border-slate-100 hover:bg-indigo-50 transition-colors" title="Editar">
                  <Edit2 className="h-4 w-4" />
                </button>
                <button onClick={() => handleDelete(veh.id)} className="text-slate-400 hover:text-red-500 p-1.5 bg-white rounded-lg shadow-sm border border-slate-100 hover:bg-red-50 transition-colors" title="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200/60 flex justify-between items-center">
              <span className={`px-2 py-1 text-[10px] uppercase font-bold tracking-wider rounded-full ${
                veh.status === 'Operativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {veh.status}
              </span>
              <span className="text-xs font-medium text-slate-500 bg-slate-200/50 px-2 py-1 rounded-full">{veh.capacity} Ton/Vol</span>
            </div>
          </div>
        ))}
        {activeGroupVehicles.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-center text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
            <Truck className="h-10 w-10 text-slate-300 mb-3" />
            <p>No hay vehículos registrados en este grupo</p>
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Editar Vehículo" : "Registrar Vehículo"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Número Interno (Móvil)</label>
            <input required type="text" value={form.internalNumber} onChange={e => setForm({...form, internalNumber: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-lg text-indigo-700" placeholder="Ej. 101" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Placa / Patente</label>
            <input required type="text" value={form.plate} onChange={e => setForm({...form, plate: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none uppercase" placeholder="Ej. ABC-123" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Capacidad (Ton/Vol)</label>
            <input type="number" min="0" value={form.capacity} onChange={e => setForm({...form, capacity: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
            <select value={form.status} onChange={e => setForm({...form, status: e.target.value as any})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="Operativo">Operativo</option>
              <option value="Inoperativo">Inoperativo</option>
            </select>
          </div>
          <div className="pt-2">
            <button type="submit" className="w-full bg-indigo-600 text-white rounded-lg py-3 text-sm font-bold hover:bg-indigo-700 flex justify-center items-center shadow-md">
              Guardar Vehículo
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={confirmDelete}
        title="Eliminar Vehículo"
        message="¿Está seguro de eliminar este vehículo? Esta acción no se puede deshacer."
      />
    </div>
  );
};

const RoutesTab = () => {
  const { state, addRoute, updateRoute, deleteRoute } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<RouteDef, 'id'>>({ name: '', code: '', operatingDays: [], origin: '', destination: '', estimatedHours: 0 });

  const activeGroupRoutes = state.routes.filter(r => r.workGroupId === state.activeWorkGroupId);

  const daysOfWeek = [
    { id: 1, label: 'Lunes' },
    { id: 2, label: 'Martes' },
    { id: 3, label: 'Miércoles' },
    { id: 4, label: 'Jueves' },
    { id: 5, label: 'Viernes' },
    { id: 6, label: 'Sábado' },
    { id: 0, label: 'Domingo' }
  ];

  const handleDayToggle = (dayId: number) => {
    setForm(prev => ({
      ...prev,
      operatingDays: prev.operatingDays.includes(dayId)
        ? prev.operatingDays.filter(d => d !== dayId)
        : [...prev.operatingDays, dayId].sort()
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.code || form.operatingDays.length === 0 || !state.activeWorkGroupId) return;
    
    if (editingId) {
      updateRoute(editingId, form);
    } else {
      addRoute(form);
    }
    
    setForm({ name: '', code: '', operatingDays: [], origin: '', destination: '', estimatedHours: 0 });
    setEditingId(null);
    setIsModalOpen(false);
  };

  const handleEdit = (route: RouteDef) => {
    setForm({ name: route.name, code: route.code, operatingDays: route.operatingDays || [], origin: route.origin, destination: route.destination, estimatedHours: route.estimatedHours, workGroup: route.workGroup });
    setEditingId(route.id);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteRoute(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const openNewModal = () => {
    setForm({ name: '', code: '', operatingDays: [], origin: '', destination: '', estimatedHours: 0 });
    setEditingId(null);
    setIsModalOpen(true);
  };

  const getDaysString = (days: number[]) => {
    if (!days || days.length === 0) return 'Ninguno';
    if (days.length === 7) return 'Todos los días';
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return days.map(d => dayNames[d]).join(', ');
  };

  if (!state.activeWorkGroupId) {
    return <ContextRequiredMessage />;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-semibold text-slate-800">Catálogo de Rutas</h3>
        <button 
          onClick={openNewModal}
          className="bg-indigo-600 text-white rounded-lg p-2 md:px-4 md:py-2 text-sm font-medium hover:bg-indigo-700 flex items-center shadow-sm"
        >
          <Plus className="h-5 w-5 md:mr-2" />
          <span className="hidden md:inline">Nueva Ruta</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeGroupRoutes.map(route => (
          <div key={route.id} className="border border-slate-200 rounded-xl p-5 bg-white shadow-sm relative group hover:border-slate-300 transition-colors">
            <div className="absolute top-3 right-3 flex space-x-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <button onClick={() => handleEdit(route)} className="text-indigo-400 hover:text-indigo-600 bg-white rounded-lg shadow-sm border border-slate-100 p-1.5 hover:bg-indigo-50 transition-colors" title="Editar">
                <Edit2 className="h-4 w-4" />
              </button>
              <button onClick={() => handleDelete(route.id)} className="text-slate-400 hover:text-red-500 bg-white rounded-lg shadow-sm border border-slate-100 p-1.5 hover:bg-red-50 transition-colors" title="Eliminar">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 mb-2 pr-12">
              <span className="bg-slate-800 text-white text-[10px] px-2 py-1 rounded-md font-bold font-mono tracking-widest">{route.code}</span>
              <h4 className="font-semibold text-slate-800 text-md truncate">{route.name}</h4>
            </div>
            
            <div className="flex flex-col text-sm text-slate-600 space-y-1.5 mb-4">
              <div className="flex items-start">
                <MapPin className="h-4 w-4 text-slate-400 mr-1.5 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{route.origin} &rarr; {route.destination}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md font-bold uppercase tracking-wider">
                {getDaysString(route.operatingDays)}
              </span>
              <div className="text-xs text-slate-500 font-medium">
                ⏱ {route.estimatedHours}h
              </div>
            </div>
          </div>
        ))}
        {activeGroupRoutes.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-center text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
            <MapPin className="h-10 w-10 text-slate-300 mb-3" />
            <p>No hay rutas registradas en este grupo</p>
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Crear Ruta Base">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">Código</label>
              <input required type="text" value={form.code} onChange={e => setForm({...form, code: e.target.value.replace(/\D/g, '')})} placeholder="Ej. 101" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Nombre de la Ruta</label>
              <input required type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ej. Ruta Norte Express" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">Frecuencia de Operación (Días)</label>
            <div className="flex flex-wrap gap-2">
              {daysOfWeek.map(day => {
                const isSelected = form.operatingDays.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => handleDayToggle(day.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors border ${
                      isSelected 
                        ? 'bg-indigo-600 text-white border-indigo-600' 
                        : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {day.label.slice(0, 3)}
                  </button>
                );
              })}
            </div>
            {form.operatingDays.length === 0 && (
              <p className="text-[10px] text-red-500 mt-1">Debe seleccionar al menos un día de operación.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Origen</label>
              <input required type="text" value={form.origin} onChange={e => setForm({...form, origin: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Destino</label>
              <input required type="text" value={form.destination} onChange={e => setForm({...form, destination: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Tiempo Estimado (Horas)</label>
            <input type="number" min="0.5" step="0.5" value={form.estimatedHours} onChange={e => setForm({...form, estimatedHours: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          
          <div className="pt-2">
            <button type="submit" disabled={form.operatingDays.length === 0} className="w-full bg-indigo-600 text-white rounded-lg py-3 text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center shadow-md">
              Guardar Ruta
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={confirmDelete}
        title="Eliminar Ruta"
        message="¿Está seguro de eliminar esta ruta? Esta acción no se puede deshacer."
      />
    </div>
  );
};

const ContextRequiredMessage = () => (
  <div className="py-16 flex flex-col items-center justify-center text-center max-w-md mx-auto">
    <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
      <Shield className="h-8 w-8" />
    </div>
    <h3 className="text-xl font-bold text-slate-800 mb-2">Seleccione un Grupo</h3>
    <p className="text-slate-500 text-sm">
      Para administrar información, primero debe seleccionar o crear un <strong>Grupo de Trabajo</strong> en la pestaña General y luego seleccionarlo en la barra superior.
    </p>
  </div>
);

