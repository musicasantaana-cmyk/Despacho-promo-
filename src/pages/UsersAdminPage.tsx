import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Edit2,
  Trash2,
  Search,
  CheckCircle,
  XCircle,
  KeyRound,
  X,
  AlertTriangle,
} from 'lucide-react';
import { AppUser, UserRole } from '../types';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { fetchUsersApi, createUserApi, updateUserApi, deleteUserApi } from '../lib/api';

const ROLE_META: Record<UserRole, { label: string; level: string; description: string; badgeClass: string }> = {
  admin: {
    label: 'Administrador',
    level: 'Nivel 1',
    description: 'Acceso total: gestión de usuarios, configuración global y operación de todos los grupos.',
    badgeClass: 'bg-slate-900 text-white border-slate-900',
  },
  gestion: {
    label: 'Admin. de Gestión',
    level: 'Nivel 2',
    description: 'Ver, agregar y modificar registros operativos, excepto configuración global y usuarios.',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  supervisor: {
    label: 'Supervisor',
    level: 'Nivel 3',
    description: 'Acceso segmentado exclusivamente a los datos y descargas de su grupo operativo asignado.',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  conductor: {
    label: 'Conductor',
    level: 'Nivel 4',
    description: 'Acceso restringido únicamente al módulo móvil de Conductores (control de tiempos).',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
  },
};

export const UsersAdminPage: React.FC = () => {
  const { state } = useAppContext();
  const { isAdmin } = useAuth();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [form, setForm] = useState<{
    username: string;
    password: string;
    fullName: string;
    role: UserRole;
    workGroupId: string;
    employeeId: string;
    active: boolean;
  }>({
    username: '',
    password: '',
    fullName: '',
    role: 'supervisor',
    workGroupId: '',
    employeeId: '',
    active: true,
  });

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchUsersApi();
      setUsers(res.users);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar la lista de usuarios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-lg mx-auto my-8">
        <Shield className="h-12 w-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Acceso Restringido</h2>
        <p className="text-sm text-slate-500 mt-1">
          El Panel de Administración de Usuarios es exclusivo para el rol Administrador (Nivel 1).
        </p>
      </div>
    );
  }

  const openCreateModal = () => {
    setEditingUser(null);
    setFormError('');
    setForm({
      username: '',
      password: '',
      fullName: '',
      role: 'supervisor',
      workGroupId: state.workGroups[0]?.id || '',
      employeeId: '',
      active: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (u: AppUser) => {
    setEditingUser(u);
    setFormError('');
    setForm({
      username: u.username,
      password: '',
      fullName: u.fullName || u.username,
      role: u.role || 'gestion',
      workGroupId: u.workGroupId || '',
      employeeId: u.employeeId || '',
      active: u.active !== false,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (form.role === 'supervisor' && !form.workGroupId) {
      setFormError('Debe asignar un Grupo Operativo obligatorio para el rol Supervisor.');
      return;
    }

    if (!editingUser && (!form.username.trim() || form.password.length < 6)) {
      setFormError('Usuario y contraseña (mínimo 6 caracteres) son obligatorios.');
      return;
    }

    if (editingUser && form.password && form.password.length < 6) {
      setFormError('Si cambia la contraseña, debe tener al menos 6 caracteres.');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        await updateUserApi(editingUser.id, {
          fullName: form.fullName.trim() || form.username,
          role: form.role,
          workGroupId: form.workGroupId,
          employeeId: form.role === 'conductor' ? form.employeeId : '',
          active: form.active,
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        await createUserApi({
          username: form.username.trim(),
          password: form.password,
          fullName: form.fullName.trim() || form.username.trim(),
          role: form.role,
          workGroupId: form.workGroupId,
          employeeId: form.role === 'conductor' ? form.employeeId : '',
        });
      }
      setIsModalOpen(false);
      await loadUsers();
    } catch (err: any) {
      setFormError(err?.message || 'Error al guardar el usuario.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u: AppUser) => {
    try {
      await updateUserApi(u.id, { active: u.active === false });
      await loadUsers();
    } catch (err: any) {
      setError(err?.message || 'No se pudo cambiar el estado.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUserApi(deleteTarget.id);
      setDeleteTarget(null);
      await loadUsers();
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar el usuario.');
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (groupFilter !== 'ALL' && (u.workGroupId || '') !== groupFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchUser = u.username.toLowerCase().includes(q);
        const matchName = (u.fullName || '').toLowerCase().includes(q);
        if (!matchUser && !matchName) return false;
      }
      return true;
    });
  }, [users, roleFilter, groupFilter, searchTerm]);

  const counts = useMemo(() => {
    return {
      total: users.length,
      adminsAndGestion: users.filter(u => u.role === 'admin' || u.role === 'gestion').length,
      supervisors: users.filter(u => u.role === 'supervisor').length,
      conductors: users.filter(u => u.role === 'conductor').length,
    };
  }, [users]);

  const groupDrivers = useMemo(() => {
    return state.employees.filter(e => {
      const isDriver = (e.role || '').toLowerCase().includes('conductor');
      if (!isDriver) return false;
      if (form.workGroupId && form.workGroupId !== 'ALL') {
        return e.workGroupId === form.workGroupId;
      }
      return true;
    });
  }, [state.employees, form.workGroupId]);

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <Shield className="h-5 w-5 text-emerald-600" />
            Administración de Usuarios y Permisos (RBAC)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Gestione cuentas de acceso, niveles de autorización y vinculación estricta por grupo operativo.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors whitespace-nowrap shrink-0"
        >
          <UserPlus className="h-4 w-4" />
          Nuevo Usuario
        </button>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuarios Registrados</span>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{counts.total}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin / Gestión</span>
          <div className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">{counts.adminsAndGestion}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Supervisores de Grupo</span>
          <div className="text-2xl font-bold text-amber-700 mt-1 tabular-nums">{counts.supervisors}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Conductores Móviles</span>
          <div className="text-2xl font-bold text-blue-700 mt-1 tabular-nums">{counts.conductors}</div>
        </div>
      </div>

      {/* Permission Levels Reference */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.keys(ROLE_META) as UserRole[]).map(roleKey => {
          const meta = ROLE_META[roleKey];
          return (
            <div key={roleKey} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-900">{meta.label}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${meta.badgeClass}`}>
                  {meta.level}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{meta.description}</p>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Toolbar & Users Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center bg-slate-50/50">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por usuario o nombre..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">Todos los niveles</option>
              <option value="admin">Nivel 1 · Administrador</option>
              <option value="gestion">Nivel 2 · Admin. Gestión</option>
              <option value="supervisor">Nivel 3 · Supervisor</option>
              <option value="conductor">Nivel 4 · Conductor</option>
            </select>

            <select
              value={groupFilter}
              onChange={e => setGroupFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">Todos los grupos</option>
              <option value="">Sin grupo específico</option>
              {state.workGroups.map(wg => (
                <option key={wg.id} value={wg.id}>
                  {wg.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
              <tr>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Nivel de Permiso</th>
                <th className="px-4 py-3">Grupo Operativo</th>
                <th className="px-4 py-3">Conductor Vinculado</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    Cargando usuarios...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    No se encontraron usuarios con los filtros actuales.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => {
                  const meta = ROLE_META[u.role || 'gestion'];
                  const group = state.workGroups.find(wg => wg.id === u.workGroupId);
                  const linkedEmp = u.employeeId ? state.employees.find(e => e.id === u.employeeId) : null;
                  const isActive = u.active !== false;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{u.fullName || u.username}</div>
                        <div className="text-xs font-mono text-slate-500">@{u.username}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-md border ${meta.badgeClass}`}>
                          {meta.level} · {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {group ? (
                          <span className="text-xs font-semibold text-slate-800 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                            {group.name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {u.role === 'supervisor' ? 'Sin asignar (Requerido)' : 'Acceso Global / Todos'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {linkedEmp ? linkedEmp.name : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleActive(u)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {isActive ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          {isActive ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Editar usuario y permisos"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-emerald-600" />
                {editingUser ? `Editar Usuario: @${editingUser.username}` : 'Crear Nuevo Usuario'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={form.fullName}
                  onChange={e => setForm({ ...form, fullName: e.target.value })}
                  placeholder="Ej. Carlos Ramírez"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre de Usuario (Login)</label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingUser)}
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  placeholder="Ej. cramirez_r3"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {editingUser ? 'Nueva Contraseña (dejar vacío para mantener actual)' : 'Contraseña'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nivel de Acceso / Rol</label>
                <select
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value as UserRole })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="admin">Nivel 1 — Administrador (Acceso Total)</option>
                  <option value="gestion">Nivel 2 — Administrador de Gestión</option>
                  <option value="supervisor">Nivel 3 — Supervisor (Por Grupo)</option>
                  <option value="conductor">Nivel 4 — Conductor (Módulo Conductores)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">{ROLE_META[form.role].description}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Grupo de Trabajo Vinculado {form.role === 'supervisor' && <span className="text-rose-500">*</span>}
                </label>
                <select
                  required={form.role === 'supervisor'}
                  value={form.workGroupId}
                  onChange={e => setForm({ ...form, workGroupId: e.target.value, employeeId: '' })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  {form.role !== 'supervisor' && <option value="">Acceso Global / Selección Libre</option>}
                  {form.role === 'supervisor' && <option value="">Seleccione un grupo obligatorio...</option>}
                  {state.workGroups.map(wg => (
                    <option key={wg.id} value={wg.id}>
                      {wg.name}
                    </option>
                  ))}
                </select>
              </div>

              {form.role === 'conductor' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Vincular con Conductor del Directorio (Opcional)
                  </label>
                  <select
                    value={form.employeeId}
                    onChange={e => setForm({ ...form, employeeId: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="">El conductor seleccionará su nombre al iniciar</option>
                    {groupDrivers.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {editingUser && (
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={e => setForm({ ...form, active: e.target.checked })}
                    className="h-4 w-4 text-emerald-600 rounded border-slate-300"
                  />
                  <span className="text-sm font-medium text-slate-700">Cuenta activa (puede iniciar sesión)</span>
                </label>
              )}

              {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded-lg">
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 px-4 border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 border border-slate-200">
            <h3 className="font-bold text-slate-900 text-lg mb-2">Eliminar Usuario</h3>
            <p className="text-sm text-slate-600 mb-6">
              ¿Está seguro de eliminar al usuario <strong>@{deleteTarget.username}</strong>? Perderá inmediatamente el acceso al sistema.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
