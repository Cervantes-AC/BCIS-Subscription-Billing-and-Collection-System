/**
 * Admin Page - User Management, Roles, Settings, Backup/Restore, Audit Logs
 */
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, Search, Edit, Trash2, Loader2, AlertCircle, 
  CheckCircle, XCircle, Download, Upload, RefreshCw,
  Shield, Key, Settings, Database, History, Users,
  UserPlus, UserMinus, Eye, Save, X, Filter,
  ChevronDown, ChevronUp, MoreHorizontal, Bell,
  Zap, ShieldCheck, Lock, Unlock, LogOut
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api } from '../lib/api';
import { formatCurrency } from '@bcis/shared';

interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  roleId: string;
  role?: { id: string; name: string; description?: string; rolePermissions?: Array<{ permission: { id: string; code: string; name: string; module: string } }> };
  status: 'active' | 'inactive';
  lastLoginAt?: string;
  createdAt: string;
}

interface Role {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  rolePermissions?: Array<{ permission: { id: string; code: string; name: string; module: string } }>;
}

interface Permission {
  id: string;
  code: string;
  name: string;
  description?: string;
  module: string;
}

interface Setting {
  id: string;
  key: string;
  value: string;
  description?: string;
  isPublic: boolean;
  updatedAt: string;
  updater?: { id: string; fullName: string };
}

interface AuditLog {
  id: string;
  actorId?: string;
  actor?: { id: string; username: string; fullName: string };
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: any;
  newValues?: any;
  reason?: string;
  ipAddress?: string;
  createdAt: string;
}

interface BackupRecord {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  type: string;
  status: 'success' | 'failed' | 'in_progress';
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  creator?: { id: string; fullName: string };
}

export function AdminPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'settings' | 'backup' | 'audit'>('users');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch data
  const { data: usersData, isLoading: usersLoading, error: usersError } = useQuery({
    queryKey: ['admin', 'users', searchQuery],
    queryFn: () => api.listUsers({ search: searchQuery, limit: 100 }),
  });

  const { data: rolesData, isLoading: rolesLoading, error: rolesError } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => api.get('/admin/roles'),
  });

  const { data: permissionsData, isLoading: permissionsLoading, error: permissionsError } = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: () => api.get('/admin/permissions'),
  });

  const { data: settingsData, isLoading: settingsLoading, error: settingsError } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get('/admin/settings', { publicOnly: false }),
  });

  const { data: auditData, isLoading: auditLoading, refetch: refetchAudit, error: auditError } = useQuery({
    queryKey: ['admin', 'audit', searchQuery],
    queryFn: () => api.get('/admin/audit-logs', { limit: 100, query: searchQuery }),
  });

  const { data: backupData, isLoading: backupLoading, refetch: refetchBackup, error: backupError } = useQuery({
    queryKey: ['admin', 'backups'],
    queryFn: () => api.get('/admin/backups', { limit: 50 }),
  });

  // Mutations
  const createUserMutation = useMutation({
    mutationFn: (data: any) => api.post('/admin/users', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }); setShowCreateUserModal(false); },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/admin/users/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }); setShowEditUserModal(false); setSelectedUser(null); },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) => api.post(`/admin/users/${id}/reset-password`, { newPassword }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }); setShowResetPasswordModal(false); setSelectedUser(null); },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }); },
  });

  const createRoleMutation = useMutation({
    mutationFn: (data: any) => api.post('/admin/roles', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] }); setShowCreateRoleModal(false); },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/admin/roles/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] }); setShowEditRoleModal(false); setSelectedRole(null); },
  });

  const updateSettingMutation = useMutation({
    mutationFn: ({ key, data }: { key: string; data: any }) => api.patch(`/admin/settings/${key}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }); },
  });

  const createBackupMutation = useMutation({
    mutationFn: (type: string) => api.post('/admin/backups', { type }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] }); },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/backups/${id}/restore`, { confirm: true }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] }); alert('Database restored successfully. Please refresh the application.'); },
  });

  const activeError = activeTab === 'users' ? (usersError || createUserMutation.error || updateUserMutation.error || resetPasswordMutation.error || deleteUserMutation.error)
    : activeTab === 'roles' ? (rolesError || permissionsError || createRoleMutation.error || updateRoleMutation.error)
    : activeTab === 'settings' ? (settingsError || updateSettingMutation.error)
    : activeTab === 'backup' ? (backupError || createBackupMutation.error || restoreBackupMutation.error)
    : auditError;

  // State for modals
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [showCreateRoleModal, setShowCreateRoleModal] = useState(false);
  const [showEditRoleModal, setShowEditRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupType, setBackupType] = useState<'full' | 'incremental' | 'manual'>('manual');

  const getStatusBadge = (status: string) => {
    const badges = {
      active: { label: 'Active', class: 'bg-green-100 text-green-800' },
      inactive: { label: 'Inactive', class: 'bg-gray-100 text-gray-800' },
      success: { label: 'Success', class: 'bg-green-100 text-green-800' },
      failed: { label: 'Failed', class: 'bg-red-100 text-red-800' },
      in_progress: { label: 'In Progress', class: 'bg-blue-100 text-blue-800' },
    };
    const badge = badges[status as keyof typeof badges] || { label: status, class: 'bg-gray-100 text-gray-800' };
    return <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${badge.class}`}>{badge.label}</span>;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <section className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="page-title">Administration</h2>
      </div>

      {/* Tabs */}
      <div className="bg-surface rounded-lg overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px overflow-x-auto">
            {[
              { id: 'users', label: 'Users', icon: Users },
              { id: 'roles', label: 'Roles & Permissions', icon: Shield },
              { id: 'settings', label: 'Settings', icon: Settings },
              { id: 'backup', label: 'Backup & Restore', icon: Database },
              { id: 'audit', label: 'Audit Logs', icon: History },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-muted hover:text-text-primary'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeError && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Administration request failed: {(activeError as Error).message}</div>}
          {/* Users Tab */}
          {activeTab === 'users' && (
            <UsersTab
              users={usersData?.items || []}
              roles={rolesData?.data || []}
              isLoading={usersLoading}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onCreate={() => { setSelectedUser(null); setShowCreateUserModal(true); }}
              onEdit={setSelectedUser}
              onDelete={(id: string) => deleteUserMutation.mutate(id)}
              onResetPassword={(user: User) => { setSelectedUser(user); setShowResetPasswordModal(true); }}
              createMutation={createUserMutation}
              updateMutation={updateUserMutation}
              resetPasswordMutation={resetPasswordMutation}
              isDeleting={deleteUserMutation.isPending}
              showCreateModal={showCreateUserModal}
              showEditModal={showEditUserModal}
              showResetPasswordModal={showResetPasswordModal}
              onCloseCreate={() => setShowCreateUserModal(false)}
              onCloseEdit={() => { setShowEditUserModal(false); setSelectedUser(null); }}
              onCloseResetPassword={() => { setShowResetPasswordModal(false); setSelectedUser(null); }}
              selectedUser={selectedUser}
              setShowEditUserModal={setShowEditUserModal}
              setShowResetPasswordModal={setShowResetPasswordModal}
              getStatusBadge={getStatusBadge}
            />
          )}

          {/* Roles Tab */}
          {activeTab === 'roles' && (
            <RolesTab
              roles={rolesData?.data || []}
              permissions={permissionsData?.data || []}
              isLoading={rolesLoading || permissionsLoading}
              onCreate={() => { setSelectedRole(null); setShowCreateRoleModal(true); }}
              onEdit={setSelectedRole}
              createMutation={createRoleMutation}
              updateMutation={updateRoleMutation}
              showCreateModal={showCreateRoleModal}
              showEditModal={showEditRoleModal}
              onCloseCreate={() => setShowCreateRoleModal(false)}
              onCloseEdit={() => { setShowEditRoleModal(false); setSelectedRole(null); }}
              selectedRole={selectedRole}
              setSelectedRole={setSelectedRole}
              setShowEditRoleModal={setShowEditRoleModal}
              setShowCreateRoleModal={setShowCreateRoleModal}
            />
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <SettingsTab
              settings={settingsData?.data || []}
              isLoading={settingsLoading}
              updateMutation={updateSettingMutation}
            />
          )}

          {/* Backup Tab */}
          {activeTab === 'backup' && (
            <BackupTab
              backups={backupData?.data?.items || []}
              isLoading={backupLoading}
              onCreate={() => setShowBackupModal(true)}
              onRestore={restoreBackupMutation.mutate}
              createMutation={createBackupMutation}
              isCreating={createBackupMutation.isPending}
              isRestoring={restoreBackupMutation.isPending}
              showModal={showBackupModal}
              onCloseModal={() => setShowBackupModal(false)}
              backupType={backupType}
              setBackupType={setBackupType}
              refetch={refetchBackup}
              setShowBackupModal={setShowBackupModal}
              formatFileSize={formatFileSize}
              getStatusBadge={getStatusBadge}
            />
          )}

          {/* Audit Tab */}
          {activeTab === 'audit' && (
            <AuditTab
              logs={auditData?.data?.items || []}
              isLoading={auditLoading}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              refetch={refetchAudit}
            />
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================
// Users Tab Component
// ============================================
function UsersTab({ 
  users, roles, isLoading, searchQuery, onSearchChange, onCreate, onEdit, onDelete, onResetPassword,
  createMutation, updateMutation, resetPasswordMutation, isDeleting,
  showCreateModal, showEditModal, showResetPasswordModal,
  onCloseCreate, onCloseEdit, onCloseResetPassword, selectedUser, setShowEditUserModal, setShowResetPasswordModal, getStatusBadge
}: any) {
  const [formData, setFormData] = useState({
    username: '', email: '', password: '', fullName: '', roleId: '', status: 'active'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedUser) {
        const { email, fullName, roleId, status } = formData;
        await updateMutation.mutateAsync({ id: selectedUser.id, data: { email, fullName, roleId, status } });
      } else {
        await createMutation.mutateAsync(formData);
      }
      setFormData({ username: '', email: '', password: '', fullName: '', roleId: '', status: 'active' });
    } catch {
      // The administration error banner displays the API failure.
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await resetPasswordMutation.mutateAsync({ id: selectedUser!.id, newPassword: formData.password });
      setFormData({ username: '', email: '', password: '', fullName: '', roleId: '', status: 'active' });
    } catch {
      // The administration error banner displays the API failure.
    }
  };

  const handleUserSelect = (user: User) => {
    if (showEditModal || showResetPasswordModal) return;
    onEdit(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: '',
      fullName: user.fullName,
      roleId: user.roleId,
      status: user.status,
    });
    setShowEditUserModal(true);
  };

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-2" /><p className="text-text-muted">Loading users...</p></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search users..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button onClick={onCreate} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          New User
        </button>
      </div>

      {/* User Table */}
      <div className="bg-surface rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Username</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Full Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Last Login</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user: User) => (
                <tr key={user.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleUserSelect(user)}>
                  <td className="px-4 py-3 font-mono text-sm">{user.username}</td>
                  <td className="px-4 py-3 font-medium">{user.fullName}</td>
                  <td className="px-4 py-3 text-sm text-text-muted">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">{user.role?.name || 'N/A'}</span>
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(user.status)}</td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {user.lastLoginAt ? format(parseISO(user.lastLoginAt), 'MMM d, yyyy HH:mm') : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); onEdit(user); setFormData({ username: user.username, email: user.email, password: '', fullName: user.fullName, roleId: user.roleId, status: user.status }); setShowEditUserModal(true); }} className="p-1 hover:bg-gray-100 rounded" title="Edit"><Edit className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); onResetPassword(user); setFormData({ username: user.username, email: user.email, password: '', fullName: user.fullName, roleId: user.roleId, status: user.status }); setShowResetPasswordModal(true); }} className="p-1 hover:bg-gray-100 rounded" title="Reset Password"><Key className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); if (confirm('Deactivate this user?')) onDelete(user.id); }} className="p-1 hover:bg-red-50 text-red-600 rounded" title="Deactivate" disabled={isDeleting}><UserMinus className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && <div className="p-12 text-center"><Users className="w-12 h-12 mx-auto text-text-muted mb-4" /><p className="text-text-muted">No users found</p><button onClick={onCreate} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg">Create First User</button></div>}
      </div>

      {/* Create/Edit User Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-surface rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-surface z-10">
              <h3 className="text-lg font-semibold">{showCreateModal ? 'Create User' : 'Edit User'}</h3>
              <button type="button" onClick={showEditModal ? onCloseEdit : onCloseCreate} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close">×</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Username <span className="text-red-500">*</span></label>
                <input type="text" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg" required disabled={showEditModal} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Email <span className="text-red-500">*</span></label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Full Name <span className="text-red-500">*</span></label>
                <input type="text" value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg" required />
              </div>
              <div>
                {showCreateModal && <>
                  <label className="block text-sm font-medium mb-2">Password <span className="text-red-500">*</span></label>
                  <input type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg" required minLength={8} />
                </>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Role <span className="text-red-500">*</span></label>
                <select value={formData.roleId} onChange={(e) => setFormData({...formData, roleId: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg" required>
                  <option value="">Select Role</option>
                  {roles.map((r: Role) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <select value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={showEditModal ? onCloseEdit : onCloseCreate} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {showCreateModal ? 'Create' : 'Update'} User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Reset Password for {selectedUser?.fullName}</h3>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">New Password <span className="text-red-500">*</span></label>
                <input type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg" required minLength={8} />
                <p className="text-xs text-text-muted mt-1">Minimum 8 characters</p>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={onCloseResetPassword} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={resetPasswordMutation.isPending} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
                  {resetPasswordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Roles Tab Component
// ============================================
function RolesTab({ roles, permissions, isLoading, onCreate, onEdit, createMutation, updateMutation, showCreateModal, showEditModal, onCloseCreate, onCloseEdit, selectedRole, setSelectedRole, setShowEditRoleModal, setShowCreateRoleModal }: any) {
  const [formData, setFormData] = useState({ name: '', description: '', permissionIds: [] as string[] });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedRole) {
        await updateMutation.mutateAsync({ id: selectedRole.id, data: formData });
      } else {
        await createMutation.mutateAsync(formData);
      }
      setFormData({ name: '', description: '', permissionIds: [] });
    } catch {
      // The administration error banner displays the API failure.
    }
  };

  const handleRoleSelect = (role: Role) => {
    onEdit(role);
    setFormData({ name: role.name, description: role.description || '', permissionIds: role.rolePermissions?.map(rp => rp.permission.id) || [] });
    setShowEditRoleModal(true);
  };

  // Group permissions by module
  const permissionsByModule: Record<string, Permission[]> = permissions.reduce((acc: Record<string, Permission[]>, p: Permission) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-2" /><p className="text-text-muted">Loading roles...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Roles & Permissions</h3>
        <button onClick={() => { setSelectedRole(null); setFormData({ name: '', description: '', permissionIds: [] }); setShowCreateRoleModal(true); }} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Role
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Roles List */}
        <div className="bg-surface rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-200 font-semibold">Roles ({roles.length})</div>
          <div className="divide-y divide-gray-200">
            {roles.map((role: Role) => (
              <div key={role.id} className="p-4 hover:bg-gray-50 cursor-pointer flex items-center justify-between" onClick={() => handleRoleSelect(role)}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{role.name}</span>
                    {role.isSystem && <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded">System</span>}
                  </div>
                  <p className="text-sm text-text-muted">{role.description || 'No description'}</p>
                  <p className="text-xs text-text-muted mt-1">{role.rolePermissions?.length || 0} permissions</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Permissions Matrix */}
        <div className="bg-surface rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-200 font-semibold">Permissions ({permissions.length})</div>
          <div className="p-4 max-h-[500px] overflow-y-auto">
            {Object.entries(permissionsByModule).map(([module, perms]: [string, Permission[]]) => (
              <div key={module} className="mb-4">
                <h4 className="text-sm font-medium text-text-primary mb-2 capitalize">{module.replace('_', ' ')}</h4>
                <div className="space-y-1">
                  {perms.map((perm: Permission) => (
                    <label key={perm.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={formData.permissionIds.includes(perm.id)} onChange={(e) => setFormData({...formData, permissionIds: e.target.checked ? [...formData.permissionIds, perm.id] : formData.permissionIds.filter(id => id !== perm.id)})} disabled={selectedRole?.isSystem} className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary disabled:opacity-50" />
                      <span title={perm.code}>{perm.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create/Edit Role Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-surface rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-surface z-10">
              <h3 className="text-lg font-semibold">{showCreateModal ? 'Create Role' : 'Edit Role'}</h3>
              <button type="button" onClick={showEditModal ? onCloseEdit : onCloseCreate} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close">×</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {showEditModal && selectedRole?.isSystem && <p className="rounded bg-blue-50 p-3 text-sm text-blue-800">System roles are read-only.</p>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Role Name <span className="text-red-500">*</span></label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg" required disabled={showEditModal && selectedRole?.isSystem} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <input type="text" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-3">Permissions</label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto p-4 border border-gray-200 rounded-lg">
                  {Object.entries(permissionsByModule).map(([module, perms]: [string, Permission[]]) => (
                    <div key={module} className="space-y-2">
                      <h5 className="text-xs font-medium text-text-primary uppercase tracking-wide mb-2">{module.replace('_', ' ')}</h5>
                      {perms.map((perm: Permission) => (
                        <label key={perm.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={formData.permissionIds.includes(perm.id)} onChange={(e) => setFormData({...formData, permissionIds: e.target.checked ? [...formData.permissionIds, perm.id] : formData.permissionIds.filter(id => id !== perm.id)})} disabled={showEditModal && selectedRole?.isSystem} className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary disabled:opacity-50" />
                          <span title={perm.code}>{perm.name}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={showEditModal ? onCloseEdit : onCloseCreate} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending || (showEditModal && selectedRole?.isSystem)} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {showCreateModal ? 'Create' : 'Update'} Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Settings Tab Component
// ============================================
function SettingsTab({ settings, isLoading, updateMutation }: any) {
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-2" /><p className="text-text-muted">Loading settings...</p></div>;

  return (
    <div className="bg-surface rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200 font-semibold">Application Settings</div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Key</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Value</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Public</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Updated</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Updated By</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {settings.map((setting: Setting) => (
              <tr key={setting.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-sm">{setting.key}</td>
                <td className="px-4 py-3">
                  {editKey === setting.id ? (
                    <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="w-full px-3 py-1 border border-primary rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary" autoFocus />
                  ) : (
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">{setting.value}</code>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-text-muted">{setting.description || '-'}</td>
                <td className="px-4 py-3">{setting.isPublic ? <CheckCircle className="w-5 h-5 text-green-500 mx-auto" /> : <XCircle className="w-5 h-5 text-gray-300 mx-auto" />}</td>
                <td className="px-4 py-3 text-sm text-text-muted">{setting.updatedAt ? format(parseISO(setting.updatedAt), 'MMM d, yyyy HH:mm') : '-'}</td>
                <td className="px-4 py-3 text-sm text-text-muted">{setting.updater?.fullName || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {editKey === setting.id ? (
                      <>
                        <button type="button" onClick={async () => { try { await updateMutation.mutateAsync({ key: setting.key, data: { value: editValue, description: setting.description } }); setEditKey(null); } catch { /* Keep the editor open and show the page-level error. */ } }} disabled={updateMutation.isPending} className="p-1 hover:bg-green-100 text-green-600 rounded disabled:opacity-50" title="Save"><CheckCircle className="w-4 h-4" /></button>
                        <button onClick={() => { setEditValue(setting.value); setEditKey(null); }} className="p-1 hover:bg-red-100 text-red-600 rounded" title="Cancel"><XCircle className="w-4 h-4" /></button>
                      </>
                    ) : (
                      <button onClick={() => { setEditValue(setting.value); setEditKey(setting.id); }} className="p-1 hover:bg-gray-100 rounded" title="Edit"><Edit className="w-4 h-4" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================
// Backup Tab Component
// ============================================
function BackupTab({ backups, isLoading, onCreate, onRestore, createMutation, isCreating, isRestoring, showModal, onCloseModal, backupType, setBackupType, refetch, setShowBackupModal, formatFileSize, getStatusBadge }: any) {
  if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-2" /><p className="text-text-muted">Loading backups...</p></div>;

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync(backupType);
      onCloseModal();
    } catch {
      // Keep the dialog open and show the page-level error.
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Backup & Restore</h3>
        <button onClick={() => setShowBackupModal(true)} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2" disabled={isCreating}>
          <Database className="w-4 h-4" />
          Create Backup
        </button>
      </div>

      <div className="bg-surface rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">File Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Started</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Completed</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Created By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {backups.map((backup: BackupRecord) => (
                <tr key={backup.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-sm">{backup.fileName}</td>
                  <td className="px-4 py-3"><span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded capitalize">{backup.type}</span></td>
                  <td className="px-4 py-3 text-right font-mono text-sm">{formatFileSize(backup.fileSize)}</td>
                  <td className="px-4 py-3">{getStatusBadge(backup.status)}</td>
                  <td className="px-4 py-3 text-sm text-text-muted">{backup.startedAt ? format(parseISO(backup.startedAt), 'MMM d, yyyy HH:mm') : '-'}</td>
                  <td className="px-4 py-3 text-sm text-text-muted">{backup.completedAt ? format(parseISO(backup.completedAt), 'MMM d, yyyy HH:mm') : '-'}</td>
                  <td className="px-4 py-3 text-sm text-text-muted">{backup.creator?.fullName || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {backup.status === 'success' && backup.type !== 'restore' && (
                        <button onClick={() => { if (confirm('Restore from this backup? This will overwrite current data.')) onRestore(backup.id); }} className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded hover:bg-purple-200" disabled={isRestoring}>Restore</button>
                      )}
                      {backup.errorMessage && <span className="text-xs text-red-600" title={backup.errorMessage}>Error</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {backups.length === 0 && <div className="p-12 text-center"><Database className="w-12 h-12 mx-auto text-text-muted mb-4" /><p className="text-text-muted">No backups found</p><button onClick={() => setShowBackupModal(true)} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg">Create First Backup</button></div>}
      </div>

      {/* Create Backup Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Create Backup</h3>
            <form onSubmit={handleCreateBackup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Backup Type <span className="text-red-500">*</span></label>
                <select value={backupType} onChange={(e) => setBackupType(e.target.value as any)} className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                  <option value="full">Full Backup</option>
                  <option value="incremental">Incremental</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <p className="text-sm text-text-muted">This will create a complete database dump using pg_dump. The backup file will be stored on the server.</p>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={onCloseModal} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={isCreating} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  Create Backup
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Audit Tab Component
// ============================================
function AuditTab({ logs, isLoading, searchQuery, onSearchChange, refetch }: any) {
  if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-2" /><p className="text-text-muted">Loading audit logs...</p></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input type="text" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search audit logs..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <button onClick={() => refetch()} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="bg-surface rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {logs.map((log: AuditLog) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-text-muted">{log.createdAt ? format(parseISO(log.createdAt), 'MMM d, yyyy HH:mm:ss') : '-'}</td>
                  <td className="px-4 py-3 text-sm font-medium">{log.actor?.fullName || log.actor?.username || 'System'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">{log.action}</span>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono">{log.entityType}:{log.entityId?.substring(0,8)}</td>
                  <td className="px-4 py-3 text-sm text-text-muted max-w-xs truncate">{log.reason || '-'}</td>
                  <td className="px-4 py-3 text-sm text-text-muted font-mono">{log.ipAddress || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logs.length === 0 && <div className="p-12 text-center"><History className="w-12 h-12 mx-auto text-text-muted mb-4" /><p className="text-text-muted">No audit logs found</p></div>}
      </div>
    </div>
  );
}
