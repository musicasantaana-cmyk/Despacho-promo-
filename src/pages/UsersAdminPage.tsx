import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Search,
  Edit2,
  Trash2,
  X,
  Lock,
  CheckCircle2,
  Ban,
  Users,
  Layers,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import {
  createAppUser,
  deleteAppUser,
  MASTER_USER,
  subscribeAppUsers,
  updateAppUser,
} from '../lib/firebase';
import { SafeAppUser, USER_ROLE_META, UserRole } from '../types';

const ROLE_ORDER: UserRole[] = ['admin', 'gestion', 'supervisor', 'conductor'];

export const UsersAdminPage: React.FC = () => {
  const { user: currentUser, isAdmin } = useAuth();
  const { allWorkGroups } = useAppContext();

  const [users, setUsers] = useState<SafeAppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');

  // Create/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SafeAppUser | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('gestion');
  const [formWorkGroupId, setFormWorkGroupId] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formFeedback, setFormFeedback] = useState<{ type: 'idle' | 'error' | 'success'; message: string }>({
    type: 'idle',
    message: '',
  });
  const [saving, setSaving] = useState(false);

  // Delete Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<SafeAppUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    const unsub = subscribeAppUsers(
      (list) => {
        setUsers(list);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );
    return () => unsub();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto mt-12 bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Acceso Restringido</h2>
        <p className="text-sm text-slate-600">
          El Panel de Administración de Usuarios es exclusivo para cuentas con Nivel 1 (Administrador).
        </p>
      </div>
    );
  }

  const masterEntry: SafeAppUser = {
    id: MASTER_USER.id,
    username: MASTER_USER.username,
    fullName: MASTER_USER.fullName,
    role: 'admin',
    workGroupId: null,
    isActive: true,
    isMaster: true,
  };

  const allDisplayUsers = useMemo(() => [masterEntry, ...users], [users]);

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allDisplayUsers.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        (u.fullName || '').toLowerCase().includes(q)
      );
    });
  }, [allDisplayUsers, searchTerm, roleFilter]);

  const roleCounts = useMemo(() => {
    const counts: Record<UserRole, number> = {
      admin: 0,
      gestion: 0,
      supervisor: 0,
      conductor: 0,
    };
    allDisplayUsers.forEach((u) => {
      counts[u.role] = (counts[u.role] || 0) + 1;
    });
    return counts;
  }, [allDisplayUsers]);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormFullName('');
    setFormPassword('');
    setFormRole('gestion');
    setFormWorkGroupId(allWorkGroups[0]?.id || '');
    setFormIsActive(true);
    setFormFeedback({ type: 'idle', message: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (target: SafeAppUser) => {
    if (target.isMaster) return;
    setEditingUser(target);
    setFormUsername(target.username);
    setFormFullName(target.fullName || '');
    setFormPassword('');
    setFormRole(target.role);
    setFormWorkGroupId(target.workGroupId || '');
    setFormIsActive(target.isActive);
    setFormFeedback({ type: 'idle', message: '' });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback({ type: 'idle', message: '' });

    if (formRole === 'supervisor' && !formWorkGroupId) {
      setFormFeedback({
        type: 'error',
        message: 'Debe asignar un Grupo Operativo específico para el rol Supervisor.',
      });
      return;
    }

    setSaving(true);
    try {
      const assignedGroup =
        formRole === 'supervisor' || formRole === 'conductor'
          ? formWorkGroupId || null
          : null;

      if (editingUser) {
        const res = await updateAppUser(editingUser.id, {
          fullName: formFullName,
          role: formRole,
          workGroupId: assignedGroup,
          isActive: formIsActive,
          newPassword: formPassword.trim() ? formPassword : undefined,
        });
        if (res.success) {
          setIsModalOpen(false);
        } else {
          setFormFeedback({ type: 'error', message: res.message });
        }
      } else {
        const res = await createAppUser({
          username: formUsername,
          password: formPassword,
          fullName: formFullName,
          role: formRole,
          workGroupId: assignedGroup,
          isActive: formIsActive,
        });
        if (res.success) {
          setIsModalOpen(false);
        } else {
          setFormFeedback({ type: 'error', message: res.message });
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (target: SafeAppUser) => {
    if (target.isMaster || target.id === currentUser?.id) return;
    await updateAppUser(target.id, {
      fullName: target.fullName,
      role: target.role,
      workGroupId: target.workGroupId,
      isActive: !target.isActive,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleteTarget.isMaster) return;
    setDeleting(true);
    await deleteAppUser(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
  };

  const getGroupName = (groupId: string | null) => {
    if (!groupId) return 'Todos los grupos';
    return allWorkGroups.find((g) => g.id === groupId)?.name || 'Grupo no encontrado';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Administración de Usuarios y Permisos
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Gestione credenciales, niveles de acceso (RBAC) y segmentación por grupo operativo.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          Nuevo Usuario
        </button>
      </div>

      {/* Role Summary Matrix (4 Tiers) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {ROLE_ORDER.map((roleKey) => {
          const meta = USER_ROLE_META[roleKey];
          const count = roleCounts[roleKey] || 0;
          return (
            <div
              key={roleKey}
              className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-slate-500">
                    Nivel {meta.level}
                  </span>
                  <span className="font-mono tabular-nums text-lg font-bold text-slate-900">
                    {count}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">{meta.shortLabel}</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {meta.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Users Table Container */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por usuario o nombre..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
            <button
              onClick={() => setRoleFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                roleFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({allDisplayUsers.length})
            </button>
            {ROLE_ORDER.map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                  roleFilter === r
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {USER_ROLE_META[r].shortLabel} ({roleCounts[r]})
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3.5">Usuario</th>
                <th className="px-5 py-3.5">Nombre</th>
                <th className="px-5 py-3.5">Nivel de Acceso</th>
                <th className="px-5 py-3.5">Grupo Operativo</th>
                <th className="px-5 py-3.5">Estado</th>
                <th className="px-5 py-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                    Cargando usuarios...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                    No se encontraron usuarios con los criterios aplicados.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const meta = USER_ROLE_META[u.role];
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-semibold text-slate-900">
                        {u.username}
                        {u.isMaster && (
                          <span className="ml-2 text-xs font-sans font-medium text-slate-500">
                            · Sistema
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-700">
                        {u.fullName || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-slate-800">
                        <span className="font-semibold">{meta.label}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700">
                        {u.role === 'supervisor' || u.role === 'conductor' ? (
                          u.workGroupId ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-slate-900">
                              <Layers className="w-3.5 h-3.5 text-slate-400" />
                              {getGroupName(u.workGroupId)}
                            </span>
                          ) : (
                            <span className="text-slate-500">
                              {u.role === 'supervisor' ? 'Sin grupo asignado' : 'Selección en campo'}
                            </span>
                          )
                        ) : (
                          <span className="text-slate-500">Acceso global</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600">
                            <Ban className="w-3.5 h-3.5" />
                            Inactivo
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {u.isMaster ? (
                          <span className="text-xs text-slate-400">Protegido</span>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditModal(u)}
                              className="p-2 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Editar usuario y permisos"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {!isSelf && (
                              <>
                                <button
                                  onClick={() => handleToggleActive(u)}
                                  className={`p-2 rounded-lg transition-colors ${
                                    u.isActive
                                      ? 'text-slate-500 hover:text-amber-700 hover:bg-amber-50'
                                      : 'text-emerald-600 hover:bg-emerald-50'
                                  }`}
                                  title={u.isActive ? 'Desactivar acceso' : 'Reactivar acceso'}
                                >
                                  {u.isActive ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(u)}
                                  className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Eliminar usuario"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
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
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {editingUser ? `Editar Usuario: ${editingUser.username}` : 'Crear Nuevo Usuario'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre de Usuario *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingUser}
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="ej. supervisor_r3"
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    placeholder="ej. Carlos Gómez"
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {editingUser ? 'Nueva Contraseña (dejar vacío para mantener la actual)' : 'Contraseña * (mínimo 6 caracteres)'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  minLength={editingUser ? undefined : 6}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder={editingUser ? '••••••••' : 'Mínimo 6 caracteres'}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nivel de Acceso y Permisos *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {ROLE_ORDER.map((r) => {
                    const meta = USER_ROLE_META[r];
                    const selected = formRole === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setFormRole(r)}
                        className={`text-left p-3 rounded-xl border transition-colors ${
                          selected
                            ? 'border-emerald-600 bg-emerald-50/70 text-slate-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">{meta.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                          {meta.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {(formRole === 'supervisor' || formRole === 'conductor') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Grupo Operativo {formRole === 'supervisor' ? '* (Obligatorio)' : '(Predeterminado opcional)'}
                  </label>
                  <select
                    required={formRole === 'supervisor'}
                    value={formWorkGroupId}
                    onChange={(e) => setFormWorkGroupId(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">
                      {formRole === 'supervisor' ? 'Seleccione un grupo operativo...' : 'Sin grupo fijo (elegirá en campo)'}
                    </option>
                    {allWorkGroups.map((wg) => (
                      <option key={wg.id} value={wg.id}>
                        {wg.name}
                      </option>
                    ))}
                  </select>
                  {formRole === 'supervisor' && (
                    <p className="text-xs text-slate-500 mt-1">
                      Este usuario solo podrá visualizar, operar y descargar información de este grupo.
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span className="text-sm font-semibold text-slate-800 block">Cuenta Activa</span>
                  <span className="text-xs text-slate-500">Permite el inicio de sesión en el sistema</span>
                </div>
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                />
              </div>

              {formFeedback.message && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium ${
                    formFeedback.type === 'error'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {formFeedback.message}
                </div>
              )}

              <div className="pt-2 flex justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50"
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
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Eliminar Usuario</h3>
            <p className="text-sm text-slate-600 mb-6">
              ¿Confirma que desea eliminar permanentemente al usuario{' '}
              <span className="font-mono font-semibold text-slate-900">{deleteTarget.username}</span>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
