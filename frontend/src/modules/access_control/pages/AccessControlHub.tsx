import React, { useEffect, useState } from 'react';
import { api } from '../../../lib/api/client';
import { Shield, Search, Loader2, Save, AlertTriangle, AlertCircle, User, Briefcase, Mail, CheckCircle } from 'lucide-react';

// ── System Modules (8) ──────────────────────────────────────────────────────
// v=canView, c=canCreate, e=canEdit, d=canDelete, a=canApprove, x=canExport
const MODULES_CONFIG = [
  { id: 'onboarding',            name: 'Onboarding',              icon: '🚀', v: true,  c: true,  e: true,  d: false, a: true,  x: true  },
  { id: 'document_verification', name: 'Doc Verification',        icon: '📄', v: true,  c: false, e: true,  d: false, a: true,  x: false },
  { id: 'eim_admin',             name: 'EIM Admin',               icon: '⚙️', v: true,  c: true,  e: true,  d: true,  a: false, x: true  },
  { id: 'employee_information',  name: 'Employee Information',    icon: '👤', v: true,  c: true,  e: true,  d: false, a: false, x: true  },
  { id: 'reporting_hierarchy',   name: 'Reporting Hierarchy',     icon: '🗂️', v: true,  c: false, e: true,  d: false, a: false, x: false },
  { id: 'leave_management',      name: 'Leave Management',        icon: '🌴', v: true,  c: true,  e: true,  d: false, a: true,  x: true  },
  { id: 'attendance_management', name: 'Attendance & Roster',     icon: '🕐', v: true,  c: true,  e: true,  d: false, a: false, x: true  },
  { id: 'self_service',          name: 'Self Service',            icon: '🙋', v: true,  c: false, e: false, d: false, a: false, x: false },
];

const API = (api.defaults.baseURL || '').replace(/\/$/, '') + '/api';
const authHeader = () => ({ 'Authorization': `Bearer ${localStorage.getItem('hr_token')}`, 'Content-Type': 'application/json' });

export default function AccessControlHub() {
  const [users, setUsers]               = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [searchTerm, setSearchTerm]     = useState('');
  const [deptFilter, setDeptFilter]     = useState('');
  const [desigFilter, setDesigFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [permissions, setPermissions]   = useState<any[]>([]);
  const [saving, setSaving]             = useState(false);
  const [saveMsg, setSaveMsg]           = useState('');
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/access-control/users`, { headers: authHeader() });
      const data = await res.json();
      if (data.success) setUsers(data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadPermissions = async (user: any) => {
    setSelectedUser(user);
    setSaveMsg('');
    try {
      const res  = await fetch(`${API}/access-control/users/${user.id}/permissions`, { headers: authHeader() });
      const data = await res.json();
      if (data.success) {
        const initialPerms = MODULES_CONFIG.map(m => {
          const existing = data.data.find((p: any) => p.moduleId === m.id);
          return existing ?? {
            moduleId: m.id, moduleAccess: false, canView: false, canCreate: false,
            canEdit: false, canDelete: false, canApprove: false, canExport: false, dataScope: 'OWN'
          };
        });
        setPermissions(initialPerms);
      }
    } catch (err) { console.error(err); }
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true); setSaveMsg('');
    try {
      const res  = await fetch(`${API}/access-control/users/${selectedUser.id}/permissions`, {
        method: 'PATCH', headers: authHeader(), body: JSON.stringify({ permissions })
      });
      const data = await res.json();
      setSaveMsg(data.success ? '✅ Permissions saved!' : '❌ ' + (data.message || 'Error'));
    } catch { setSaveMsg('❌ Network error'); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (isActive: boolean) => {
    if (!selectedUser) return;
    try {
      const res  = await fetch(`${API}/access-control/users/${selectedUser.id}/status`, {
        method: 'PATCH', headers: authHeader(), body: JSON.stringify({ isActive: isActive ? 1 : 0 })
      });
      const data = await res.json();
      if (data.success) {
        const updated = { ...selectedUser, isActive: isActive ? 1 : 0 };
        setSelectedUser(updated);
        setUsers(users.map(u => u.id === selectedUser.id ? { ...u, isActive: isActive ? 1 : 0 } : u));
      } else {
        alert(data.message);
      }
    } catch (err) { console.error(err); }
  };

  const handlePermChange = (moduleId: string, field: string, value: boolean | string) => {
    setPermissions(prev => prev.map(p => {
      if (p.moduleId !== moduleId) return p;
      let np = { ...p, [field]: value };

      if (field === 'moduleAccess' && !value)
        np = { ...np, canView: false, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false };
      if (field === 'moduleAccess' && value)
        np = { ...np, canView: true };
      if (['canCreate','canEdit','canDelete','canApprove','canExport'].includes(field) && value)
        np = { ...np, canView: true, moduleAccess: true };
      if (field === 'canView' && !value)
        np = { ...np, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, moduleAccess: false };
      if (field === 'canDelete' && value)
        setShowDeleteWarning(true);

      return np;
    }));
  };

  const selectAll = (moduleId: string, mConfig: any) => {
    setPermissions(prev => prev.map(p => p.moduleId !== moduleId ? p : {
      ...p, moduleAccess: true,
      canView: mConfig.v, canCreate: mConfig.c, canEdit: mConfig.e,
      canDelete: mConfig.d, canApprove: mConfig.a, canExport: mConfig.x
    }));
  };

  const clearAll = (moduleId: string) => {
    setPermissions(prev => prev.map(p => p.moduleId !== moduleId ? p : {
      ...p, moduleAccess: false, canView: false, canCreate: false,
      canEdit: false, canDelete: false, canApprove: false, canExport: false
    }));
  };

  const filteredUsers = users.filter(u => {
    const term = searchTerm.toLowerCase();
    const matchSearch = u.name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term) || u.employeeNo?.toLowerCase().includes(term);
    const matchDept   = deptFilter   ? u.department  === deptFilter   : true;
    const matchDesig  = desigFilter  ? u.designation === desigFilter  : true;
    const matchStatus = statusFilter ? (statusFilter === 'active' ? (u.isActive === 1 || u.isActive === true) : (u.isActive === 0 || u.isActive === false)) : true;
    return matchSearch && matchDept && matchDesig && matchStatus;
  });

  const uniqueDepts  = Array.from(new Set(users.map(u => u.department).filter(Boolean)));
  const uniqueDesigs = Array.from(new Set(users.map(u => u.designation).filter(Boolean)));
  const isSuperAdmin = selectedUser?.role === 'SUPER_ADMIN';

  // ── Checkbox component ─────────────────────────────────────────────────────
  const Cb = ({ moduleId, field, enabled, perm }: { moduleId: string, field: string, enabled: boolean, perm: any }) => {
    if (!enabled) return <span className="text-slate-200 text-lg select-none">—</span>;
    const isDisabled = isSuperAdmin
      || (field !== 'moduleAccess' && !perm.moduleAccess)
      || (field !== 'canView' && field !== 'moduleAccess' && !perm.canView);
    return (
      <label className="inline-flex items-center justify-center cursor-pointer">
        <input
          type="checkbox"
          checked={isSuperAdmin ? true : !!perm[field]}
          disabled={isDisabled}
          onChange={e => handlePermChange(moduleId, field, e.target.checked)}
          className="w-4 h-4 rounded accent-indigo-600 cursor-pointer disabled:opacity-30"
        />
      </label>
    );
  };

  return (
    <div className="p-6 space-y-5 min-h-full bg-slate-50">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
          <Shield size={20} className="text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Access Control</h2>
          <p className="text-sm text-slate-500">Manage employee access to HR modules and system functions.</p>
        </div>
      </div>

      {!selectedUser ? (
        /* ── User List ── */
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Filters */}
          <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center bg-slate-50">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                placeholder="Search by name, email or ID..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
              />
            </div>
            <select value={deptFilter}   onChange={e => setDeptFilter(e.target.value)}   className="px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none bg-white">
              <option value="">All Departments</option>
              {uniqueDepts.map(d => <option key={d as string} value={d as string}>{d as string}</option>)}
            </select>
            <select value={desigFilter}  onChange={e => setDesigFilter(e.target.value)}  className="px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none bg-white">
              <option value="">All Designations</option>
              {uniqueDesigs.map(d => <option key={d as string} value={d as string}>{d as string}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none bg-white">
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 font-semibold">Employee</th>
                  <th className="px-5 py-3 font-semibold">Department & Role</th>
                  <th className="px-5 py-3 font-semibold">System Role</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr><td colSpan={5} className="py-16 text-center"><Loader2 className="animate-spin text-indigo-500 mx-auto" size={24} /></td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={5} className="py-16 text-center text-slate-400">No users found.</td></tr>
                ) : (
                  filteredUsers.map(user => (
                    <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                            {user.name?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800">{user.name}</div>
                            <div className="text-xs text-slate-400">{user.employeeNo || '—'} · {user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-700 text-sm">{user.designation || '—'}</div>
                        <div className="text-xs text-slate-400">{user.department || '—'}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold tracking-wide ${
                          user.role === 'SUPER_ADMIN' ? 'bg-red-100 text-red-700' :
                          user.role === 'ADMIN'       ? 'bg-amber-100 text-amber-700' :
                                                        'bg-blue-100 text-blue-700'
                        }`}>{user.role}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => loadPermissions(user)}
                          className="px-3 py-1.5 bg-indigo-50 text-indigo-600 font-medium text-xs rounded-lg hover:bg-indigo-100 transition-colors"
                        >
                          Manage Access
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Permission Editor ── */
        <div className="space-y-4">
          <button onClick={() => setSelectedUser(null)} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
            ← Back to Users
          </button>

          {/* User Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                {selectedUser.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">{selectedUser.name}</h3>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-slate-500">
                  <span className="flex items-center gap-1"><User size={13}/> {selectedUser.employeeNo || 'No ID'}</span>
                  <span className="flex items-center gap-1"><Mail size={13}/> {selectedUser.email}</span>
                  {selectedUser.designation && <span className="flex items-center gap-1"><Briefcase size={13}/> {selectedUser.designation} · {selectedUser.department}</span>}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={`px-2.5 py-1 rounded text-[11px] font-bold tracking-wider ${
                isSuperAdmin ? 'bg-red-100 text-red-700' :
                selectedUser.role === 'ADMIN' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
              }`}>{selectedUser.role}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 font-medium">Account Active</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer"
                    checked={Boolean(selectedUser.isActive)}
                    onChange={e => toggleStatus(e.target.checked)}
                    disabled={isSuperAdmin}
                  />
                  <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
                </label>
              </div>
              {!selectedUser.isActive && (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle size={11}/> User cannot log in
                </span>
              )}
            </div>
          </div>

          {/* Permissions Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-800">Module Permissions</h3>
                <p className="text-xs text-slate-500 mt-0.5">Configure granular access for each HR module.</p>
              </div>
              <div className="flex items-center gap-3">
                {saveMsg && <span className={`text-sm font-medium ${saveMsg.startsWith('✅') ? 'text-emerald-600' : 'text-red-600'}`}>{saveMsg}</span>}
                <button
                  onClick={handleSave}
                  disabled={saving || isSuperAdmin}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save Permissions
                </button>
              </div>
            </div>

            {isSuperAdmin && (
              <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <AlertCircle className="text-red-500 mt-0.5 shrink-0" size={18} />
                <div>
                  <h4 className="font-bold text-red-800 text-sm">Super Admin</h4>
                  <p className="text-sm text-red-600">Super Admin has full, unrestricted access to all modules. Permissions cannot be edited.</p>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold w-52 border-r border-slate-100">Module</th>
                    <th className="px-3 py-3 text-center font-semibold w-28 bg-indigo-50/50">Module Access</th>
                    <th className="px-3 py-3 text-center font-semibold">View</th>
                    <th className="px-3 py-3 text-center font-semibold">Create</th>
                    <th className="px-3 py-3 text-center font-semibold">Edit</th>
                    <th className="px-3 py-3 text-center font-semibold">Delete</th>
                    <th className="px-3 py-3 text-center font-semibold">Approve</th>
                    <th className="px-3 py-3 text-center font-semibold border-r border-slate-100">Export</th>
                    <th className="px-3 py-3 text-left font-semibold w-40">Data Scope</th>
                    <th className="px-3 py-3 text-center font-semibold">Quick</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {MODULES_CONFIG.map(mConfig => {
                    const p = permissions.find(x => x.moduleId === mConfig.id) || {};
                    const rowActive = isSuperAdmin || p.moduleAccess;
                    return (
                      <tr key={mConfig.id} className={`transition-colors ${rowActive ? 'hover:bg-indigo-50/20' : 'bg-slate-50/40 opacity-70'}`}>
                        <td className="px-4 py-3 border-r border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{mConfig.icon}</span>
                            <span className="font-medium text-slate-700">{mConfig.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center bg-indigo-50/30">
                          <Cb moduleId={mConfig.id} field="moduleAccess" enabled={true} perm={p} />
                        </td>
                        <td className="px-3 py-3 text-center"><Cb moduleId={mConfig.id} field="canView"    enabled={mConfig.v} perm={p} /></td>
                        <td className="px-3 py-3 text-center"><Cb moduleId={mConfig.id} field="canCreate"  enabled={mConfig.c} perm={p} /></td>
                        <td className="px-3 py-3 text-center"><Cb moduleId={mConfig.id} field="canEdit"    enabled={mConfig.e} perm={p} /></td>
                        <td className="px-3 py-3 text-center"><Cb moduleId={mConfig.id} field="canDelete"  enabled={mConfig.d} perm={p} /></td>
                        <td className="px-3 py-3 text-center"><Cb moduleId={mConfig.id} field="canApprove" enabled={mConfig.a} perm={p} /></td>
                        <td className="px-3 py-3 text-center border-r border-slate-100"><Cb moduleId={mConfig.id} field="canExport" enabled={mConfig.x} perm={p} /></td>
                        <td className="px-3 py-3">
                          <select
                            value={isSuperAdmin ? 'ALL' : (p.dataScope || 'OWN')}
                            onChange={e => handlePermChange(mConfig.id, 'dataScope', e.target.value)}
                            disabled={!rowActive || isSuperAdmin}
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-400 disabled:opacity-40"
                          >
                            <option value="OWN">Own Records Only</option>
                            <option value="DIRECT_REPORTS">Direct Reports</option>
                            <option value="DEPARTMENT">Department</option>
                            <option value="ALL">All Employees</option>
                          </select>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => selectAll(mConfig.id, mConfig)} disabled={isSuperAdmin} className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-30 px-1.5 py-0.5 rounded hover:bg-indigo-50">All</button>
                            <span className="text-slate-200">|</span>
                            <button onClick={() => clearAll(mConfig.id)} disabled={isSuperAdmin} className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 disabled:opacity-30 px-1.5 py-0.5 rounded hover:bg-slate-100">None</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Delete Warning Modal */}
      {showDeleteWarning && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 mx-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="text-red-600" size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Critical Permission</h3>
                <p className="text-sm text-slate-500 mt-1">You've assigned <b>Delete</b> permission. This allows permanent removal of records. Ensure this user is authorized.</p>
                <div className="mt-4 flex justify-end">
                  <button onClick={() => setShowDeleteWarning(false)} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800">
                    Understood
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
