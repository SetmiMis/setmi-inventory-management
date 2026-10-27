import Link from "next/link";
import { ArrowDownToLine, Building2, Check, ChevronLeft, ChevronRight, Eye, History, Mail, Plus, Search, ShieldCheck, UserCheck, UserX, Users, X as XIcon, type LucideIcon } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { requireAdmin } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { RowsPerPage } from "../../items/item-controls";
import { AccessForm, AddUserForm, CancelInvite, ChangeRoleForm, DepartmentForm, ProfileForm, RoleActiveButton, RoleEditor, UserRowMenu, type LocationOption, type PermissionOption } from "./user-form";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const TABS = ["users", "roles", "permissions", "departments", "logs"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { users: "Users", roles: "Roles", permissions: "Permissions", departments: "Departments", logs: "Access Logs" };
const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]", INACTIVE: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]", INVITED: "bg-[#fdf3d0] text-[#8a6a00] dark:bg-[#4a3d10] dark:text-[#f2d166]",
};
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", INACTIVE: "Inactive", INVITED: "Invited" };
const AVATAR = ["#2a63d6", "#16a05f", "#e8731a", "#7a55d6", "#d6402f", "#0e8f8f", "#c2417a"];
const ACTION_LABEL: Record<string, string> = {
  SET_ACTIVE: "Login switched", SET_ADMIN: "Administrator right changed", SET_PERMISSIONS: "Permissions changed", SET_LOCATIONS: "Places changed", SET_PROFILE: "Profile changed",
  APPLY_ROLE: "Role given", SAVE_ROLE: "Role saved", INVITE_USED: "Invite used (first sign-in)", INSERT: "Created", UPDATE: "Changed", DELETE: "Removed",
};
const ENTITY_LABEL: Record<string, string> = { profiles: "User", user_permissions: "Permissions", user_locations: "Places", roles: "Role", role_permissions: "Role permissions", departments: "Department", user_invites: "Invite" };

type Row = {
  id: string; kind: "USER" | "INVITE"; email: string; full_name: string | null; role_id: string | null; role_name: string | null; department_id: string | null; department_name: string | null;
  is_active: boolean; is_admin: boolean; status: string; last_login: string | null; created_at: string; perm_count: number;
};
type RoleInfo = { id: string; name: string; description: string | null; grants_admin: boolean; is_system: boolean; is_active: boolean; users: number; perm_count: number; keys: string[] };
type PageData = {
  total: number; rows: Row[]; kpi: { total: number; active: number; inactive: number; invited: number; roles: number; departments: number };
  roles: RoleInfo[]; departments: { id: string; name: string; is_active: boolean; users: number }[];
};
const EMPTY: PageData = { total: 0, rows: [], kpi: { total: 0, active: 0, inactive: 0, invited: 0, roles: 0, departments: 0 }, roles: [], departments: [] };
type LogRow = { id: number; at: string; action: string; entity: string; entity_id: string | null; details: Record<string, unknown> | null; actor_name: string | null; target_name: string | null };

const n = (v: number) => Number(v).toLocaleString("en-IN");
const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "Never");
const initials = (name: string) => name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
const colorOf = (s: string) => AVATAR[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length];
const Avatar = ({ name, size = 36 }: { name: string; size?: number }) => <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ background: colorOf(name), width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</span>;
const StatusPill = ({ status }: { status: string }) => <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />{STATUS_LABEL[status]}</span>;
const RoleBadge = ({ name, admin }: { name: string | null; admin?: boolean }) => name
  ? <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${admin ? "bg-[#fde8ec] text-[#b03050] dark:bg-[#4a1c2a] dark:text-[#f5a0b8]" : "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]"}`}>{name}</span> : <span className="text-muted">-</span>;

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireAdmin();
  const sp = await searchParams;

  const tab: Tab = (TABS as readonly string[]).includes(first(sp.tab) ?? "") ? (first(sp.tab) as Tab) : "users";
  const q = (first(sp.q) ?? "").replace(/[^\p{L}\p{N}@ ._+-]/gu, "").slice(0, 60).trim();
  const role = z.uuid().safeParse(first(sp.role)).data ?? "";
  const department = z.uuid().safeParse(first(sp.department)).data ?? "";
  const status = ["ACTIVE", "INACTIVE", "INVITED"].includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);

  const supabase = await createClient();
  const [{ data, error }, permsRes, locsRes] = await Promise.all([
    supabase.rpc("admin_users_page", { p_q: q || null, p_role: role || null, p_department: department || null, p_status: status === "all" ? null : status, p_limit: size, p_offset: (page - 1) * size }),
    supabase.from("permissions").select("key, module, description").order("module").order("key"),
    supabase.from("locations").select("id, code, name, type").eq("is_active", true).neq("type", "TRANSIT").order("name"),
  ]);
  const result = (data ?? EMPTY) as PageData;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));
  const permissionOptions: PermissionOption[] = permsRes.data ?? [];
  const locationOptions: LocationOption[] = (locsRes.data ?? []).map((l) => ({ id: l.id, label: `${l.name} (${l.type === "SHOP" ? "Shop" : "Warehouse"}, ${l.code})` }));
  const roleOptions = result.roles.filter((r) => r.is_active).map((r) => ({ id: r.id, name: r.name }));
  const deptOptions = result.departments.filter((d) => d.is_active).map((d) => ({ id: d.id, name: d.name }));

  const selParam = first(sp.sel);
  const pRaw = first(sp.p);
  const selId = selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? (pRaw === "add" ? null : result.rows[0]?.id) ?? null);
  const panelTab = pRaw === "profile" ? "profile" : pRaw === "activity" ? "activity" : "roles";
  const adding = pRaw === "add";
  const editRole = z.uuid().safeParse(first(sp.edit)).data ?? "";
  const newRole = first(sp.edit) === "new";

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      tab: tab !== "users" ? tab : undefined, q: q || undefined, role: role || undefined, department: department || undefined, status: status !== "all" ? status : undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, p: pRaw,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/admin/users?${s}` : "/admin/users";
  };
  const exportQuery = new URLSearchParams(Object.entries({ q, role, department, status: status !== "all" ? status : "" }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Administration</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Users &amp; Roles</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Users &amp; Roles</h1>
          <p className="mt-1 text-sm text-muted">Manage system users, roles, permissions and access control. Only administrators can open this page.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <Link href="/admin/users?tab=logs" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted"><History size={18} aria-hidden /> Activity Log</Link>
          <a href={`/admin/users/export${exportQuery ? `?${exportQuery}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted"><ArrowDownToLine size={18} aria-hidden /> Export</a>
          <Link href="/admin/users?p=add" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong"><Plus size={18} aria-hidden /> Add User</Link>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Kpi icon={Users} tint="blue" label="Total Users" value={n(kpi.total)} sub={kpi.invited > 0 ? `${kpi.invited} invited` : undefined} href="/admin/users" />
        <Kpi icon={UserCheck} tint="green" label="Active Users" value={n(kpi.active)} href="/admin/users?status=ACTIVE" />
        <Kpi icon={UserX} tint="red" label="Inactive Users" value={n(kpi.inactive)} href="/admin/users?status=INACTIVE" />
        <Kpi icon={ShieldCheck} tint="violet" label="Total Roles" value={n(kpi.roles)} href="/admin/users?tab=roles" />
        <Kpi icon={Building2} tint="amber" label="Departments" value={n(kpi.departments)} href="/admin/users?tab=departments" />
      </section>

      <div role="tablist" aria-label="Sections" className="flex flex-wrap gap-1 border-b border-line text-sm">
        {TABS.map((t) => (
          <Link key={t} href={t === "users" ? "/admin/users" : `/admin/users?tab=${t}`} role="tab" aria-selected={t === tab}
            className={`-mb-px min-h-11 whitespace-nowrap border-b-2 px-4 py-2.5 font-semibold ${t === tab ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>{TAB_LABEL[t]}</Link>
        ))}
      </div>

      {tab === "users" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
          <section className={`${cardClass} min-w-0 !p-4`}>
            <form method="get" className="mb-4 grid gap-3 md:grid-cols-4 2xl:grid-cols-[minmax(10rem,2fr)_repeat(3,minmax(0,1fr))_auto_auto] 2xl:items-end">
              <label className="relative block md:col-span-4 2xl:col-span-1"><span className="sr-only">Search</span>
                <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input name="q" defaultValue={q} placeholder="Search by name, email, role..." autoComplete="off" className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" /></label>
              <FilterSelect label="Role" name="role" value={role}><option value="">All Roles</option>{result.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</FilterSelect>
              <FilterSelect label="Department" name="department" value={department}><option value="">All Departments</option>{result.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</FilterSelect>
              <FilterSelect label="Status" name="status" value={status}><option value="all">All Status</option>{["ACTIVE", "INACTIVE", "INVITED"].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</FilterSelect>
              <Link href="/admin/users" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
              <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong"><Search size={16} aria-hidden /> Filter</button>
            </form>

            {result.rows.length === 0 ? (
              <EmptyState icon={Users} title="No users found" text={q || role || department || status !== "all" ? "Try a different word, or press Clear." : "Add a user with the button on top."} />
            ) : (
              <div className="overflow-x-auto">
                <table className="dash-table w-full text-left text-sm">
                  <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
                  <tbody>{result.rows.map((r, i) => {
                    const display = r.full_name?.trim() || r.email.split("@")[0];
                    const isSel = r.id === selId && !adding;
                    const viewHref = keep({ sel: r.id, p: "roles" });
                    return (
                      <tr key={r.id} aria-selected={isSel} className={isSel ? "!bg-brand-soft" : ""}>
                        <td className="text-muted">{(page - 1) * size + i + 1}</td>
                        <td className="min-w-40"><Link href={viewHref} className="flex items-center gap-2.5 font-semibold"><Avatar name={display} />{display}{r.id === me.id && <span className="text-xs font-normal text-muted">(you)</span>}</Link></td>
                        <td className="text-[13px]">{r.email}</td>
                        <td><RoleBadge name={r.role_name ?? (r.is_admin ? "Admin" : null)} admin={r.is_admin} /></td>
                        <td>{r.department_name ?? "-"}</td>
                        <td><StatusPill status={r.status} /></td>
                        <td className="whitespace-nowrap">{r.kind === "INVITE" ? "Not signed in yet" : dateTime(r.last_login)}</td>
                        <td><span className="flex items-center gap-1">
                          <Link href={viewHref} aria-label={`Open ${display}`} title="Open" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                          <UserRowMenu viewHref={viewHref} accessHref={keep({ sel: r.id, p: "roles" })} />
                        </span></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} users</span>
              <nav aria-label="Pagination" className="flex items-center gap-1.5">
                {page > 1 ? <PageLink href={keep({ page: page - 1, sel: undefined })} label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink> : <PageLink disabled label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink>}
                {pages.map((p, i) => p === "gap" ? <span key={`g${i}`} className="px-1 text-muted">...</span> : <PageLink key={p} href={keep({ page: p, sel: undefined })} active={p === page} label={`Page ${p}`}>{p}</PageLink>)}
                {page < lastPage ? <PageLink href={keep({ page: page + 1, sel: undefined })} label="Next page"><ChevronRight size={16} aria-hidden /></PageLink> : <PageLink disabled label="Next page"><ChevronRight size={16} aria-hidden /></PageLink>}
              </nav>
              <RowsPerPage size={size} sizes={SIZES} basePath={keep({ size: undefined, page: undefined, sel: undefined })} />
            </div>
          </section>

          <aside aria-label="User details" className="h-fit min-w-0 space-y-5 xl:sticky xl:top-20">
            <div className={`${cardClass} !p-4`}>
              {adding ? (
                <>
                  <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Add User</h2><Link href="/admin/users" aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><XIcon size={20} aria-hidden /></Link></div>
                  <AddUserForm roles={roleOptions} departments={deptOptions} locationOptions={locationOptions} />
                </>
              ) : (
                <UserPanel selId={selId} rows={result.rows} panelTab={panelTab} keep={keep} meId={me.id} roles={result.roles} departments={result.departments} permissionOptions={permissionOptions} locationOptions={locationOptions} />
              )}
            </div>
          </aside>
        </div>
      )}

      {tab === "roles" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section className={`${cardClass} min-w-0 !p-4`}>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold">Roles</h2><Link href="/admin/users?tab=roles&edit=new" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-brand-strong"><Plus size={16} aria-hidden /> New Role</Link></div>
            <div className="overflow-x-auto"><table className="dash-table w-full text-left text-sm">
              <thead><tr><th>Role</th><th className="text-right">Users</th><th className="text-right">Permissions</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{result.roles.map((r) => (
                <tr key={r.id} aria-selected={r.id === editRole} className={r.id === editRole ? "!bg-brand-soft" : ""}>
                  <td className="min-w-40"><Link href={`/admin/users?tab=roles&edit=${r.id}`} className="font-semibold">{r.name}</Link><span className="block text-xs text-muted">{r.description}</span></td>
                  <td className="text-right font-mono">{n(r.users)}</td><td className="text-right font-mono">{r.is_system ? "All" : n(r.perm_count)}</td>
                  <td><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${r.is_active ? STATUS_STYLE.ACTIVE : STATUS_STYLE.INACTIVE}`}>{r.is_active ? "On" : "Off"}</span></td>
                  <td><span className="flex items-center gap-1"><Link href={`/admin/users?tab=roles&edit=${r.id}`} className="min-h-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold hover:bg-surface-muted">{r.is_system ? "View" : "Edit"}</Link>{!r.is_system && <RoleActiveButton roleId={r.id} active={r.is_active} />}</span></td>
                </tr>
              ))}</tbody>
            </table></div>
          </section>
          <section className={`${cardClass} min-w-0 !p-4`}>
            {(() => {
              const cur = result.roles.find((r) => r.id === editRole);
              if (!cur && !newRole) return <p className="py-8 text-center text-sm text-muted">Choose a role to see or change its permissions, or make a new role.</p>;
              return (<><h2 className="mb-3 text-base font-bold">{cur ? cur.name : "New Role"}</h2>
                <RoleEditor roleId={cur?.id ?? ""} name={cur?.name ?? ""} description={cur?.description ?? ""} keys={cur?.keys ?? []} system={!!cur?.is_system} permissionOptions={permissionOptions} /></>);
            })()}
          </section>
        </div>
      )}

      {tab === "permissions" && (
        <section className={`${cardClass} min-w-0 !p-4`}>
          <h2 className="mb-1 text-base font-bold">Permissions by role</h2>
          <p className="mb-3 text-sm text-muted">What each role gives (a template). Change a role on the Roles tab. People can also have extra or fewer permissions than their role.</p>
          <div className="overflow-x-auto"><table className="dash-table w-full text-left text-xs">
            <thead><tr><th>Permission</th>{result.roles.filter((r) => r.is_active).map((r) => <th key={r.id} className="text-center">{r.name}</th>)}</tr></thead>
            <tbody>{permissionOptions.map((p) => (
              <tr key={p.key}><td className="min-w-56"><span className="font-semibold">{p.description}</span><span className="block text-muted">{p.key}</span></td>
                {result.roles.filter((r) => r.is_active).map((r) => <td key={r.id} className="text-center">{r.grants_admin || r.keys.includes(p.key) ? <Check size={16} aria-label="Yes" className="mx-auto text-green-600" /> : <span aria-label="No" className="text-muted">-</span>}</td>)}</tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {tab === "departments" && (
        <section className={`${cardClass} min-w-0 max-w-3xl !p-4`}>
          <h2 className="mb-3 text-base font-bold">Departments</h2>
          <div className="mb-4 rounded-xl border border-line bg-surface-muted p-3"><p className="mb-2 text-sm font-semibold">Add a department</p><DepartmentForm id="" name="" active /></div>
          <ul className="divide-y divide-line">{result.departments.map((d) => (
            <li key={d.id} className="py-2.5"><div className="mb-1 text-xs text-muted">{n(d.users)} user(s){d.is_active ? "" : " · switched off"}</div><DepartmentForm id={d.id} name={d.name} active={d.is_active} /></li>
          ))}</ul>
        </section>
      )}

      {tab === "logs" && <AccessLogs page={page} size={size} keep={keep} />}
    </main>
  );
}

async function AccessLogs({ page, size, keep }: { page: number; size: number; keep: (extra: Record<string, string | number | undefined>) => string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_access_log", { p_limit: size, p_offset: (page - 1) * size });
  const log = (data ?? { total: 0, rows: [] }) as { total: number; rows: LogRow[] };
  const total = Number(log.total);
  const lastPage = Math.max(1, Math.ceil(total / size));
  const describe = (r: LogRow) => {
    const d = r.details ?? {};
    if (r.action === "SET_PERMISSIONS") return `${(d.keys as string[] | undefined)?.length ?? 0} permission(s)`;
    if (r.action === "SET_LOCATIONS") return `${(d.locations as string[] | undefined)?.length ?? 0} place(s)`;
    if (r.action === "SET_ACTIVE") return d.active ? "switched on" : "switched off";
    if (r.action === "SET_ADMIN") return d.admin ? "made administrator" : "administrator right removed";
    if (r.action === "APPLY_ROLE") return String(d.role ?? "");
    if (r.action === "SAVE_ROLE") return `${String(d.name ?? "")} (${(d.keys as string[] | undefined)?.length ?? 0} permissions)`;
    if (r.action === "INVITE_USED") return String(d.email ?? "");
    const row = ((d.new ?? d.old) as Record<string, unknown> | undefined) ?? {};
    return String(row.email ?? row.name ?? "");
  };
  return (
    <section className={`${cardClass} min-w-0 !p-4`}>
      <h2 className="mb-1 text-base font-bold">Access Logs</h2>
      <p className="mb-3 text-sm text-muted">Changes to users, roles, permissions, places and invites (from the audit log). Every sign-in is not recorded here; the last login of each person is on the Users tab.</p>
      {error && <p role="alert" className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}
      {log.rows.length === 0 ? <EmptyState icon={History} title="No changes yet" text="Changes made on this page will be listed here." /> : (
        <div className="overflow-x-auto"><table className="dash-table w-full text-left text-sm">
          <thead><tr><th>Time</th><th>Done by</th><th>What</th><th>About</th><th>Detail</th></tr></thead>
          <tbody>{log.rows.map((r) => (
            <tr key={r.id}><td className="whitespace-nowrap">{dateTime(r.at)}</td><td>{r.actor_name ?? "-"}</td><td>{ACTION_LABEL[r.action] ?? r.action}</td><td>{r.target_name ?? ENTITY_LABEL[r.entity] ?? r.entity}</td><td className="text-muted">{describe(r)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} changes</span>
        <nav aria-label="Pagination" className="flex items-center gap-1.5">
          {page > 1 ? <PageLink href={keep({ page: page - 1 })} label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink> : <PageLink disabled label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink>}
          <span className="px-2 text-muted">Page {page} of {lastPage}</span>
          {page < lastPage ? <PageLink href={keep({ page: page + 1 })} label="Next page"><ChevronRight size={16} aria-hidden /></PageLink> : <PageLink disabled label="Next page"><ChevronRight size={16} aria-hidden /></PageLink>}
        </nav>
        <RowsPerPage size={size} sizes={SIZES} basePath={keep({ size: undefined, page: undefined })} />
      </div>
    </section>
  );
}

async function UserPanel({ selId, rows, panelTab, keep, meId, roles, departments, permissionOptions, locationOptions }: {
  selId: string | null; rows: Row[]; panelTab: "roles" | "profile" | "activity"; keep: (extra: Record<string, string | number | undefined>) => string; meId: string;
  roles: RoleInfo[]; departments: PageData["departments"]; permissionOptions: PermissionOption[]; locationOptions: LocationOption[];
}) {
  if (!selId) return <p className="py-6 text-center text-sm text-muted">Choose a user from the list to see them here.</p>;
  const supabase = await createClient();
  const row = rows.find((r) => r.id === selId);
  const head = (r: Row) => {
    const display = r.full_name?.trim() || r.email.split("@")[0];
    return (
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3"><Avatar name={display} size={52} />
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{display}</h2><StatusPill status={r.status} /></div>
            <p className="flex items-center gap-1 text-xs text-muted"><Mail size={12} aria-hidden /> {r.email}</p>
            <p className="text-xs text-muted">{r.department_name ?? "No department"} · Last login: {r.kind === "INVITE" ? "not signed in yet" : dateTime(r.last_login)}</p></div></div>
        <Link href={keep({ sel: "none", p: undefined })} aria-label="Close" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface-muted"><XIcon size={20} aria-hidden /></Link>
      </div>
    );
  };
  if (!row) return <p className="py-6 text-center text-sm text-muted">This user is not in the list (change the filters).</p>;

  if (row.kind === "INVITE") {
    return (
      <div className="space-y-4">
        {head(row)}
        <dl className="space-y-1 text-[13px]">
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"><dt className="text-muted">Role</dt><dd><RoleBadge name={row.role_name} admin={row.is_admin} /></dd></div>
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"><dt className="text-muted">Permissions</dt><dd>{n(row.perm_count)} (from the role)</dd></div>
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"><dt className="text-muted">Invited on</dt><dd>{dateTime(row.created_at)}</dd></div>
        </dl>
        <div className="rounded-lg border border-line bg-surface-muted p-3 text-xs text-muted">Waiting for the first sign-in. Make the login with this email in the Supabase dashboard (Authentication, Users). The role, department and places are set at that moment.</div>
        <CancelInvite inviteId={row.id} />
      </div>
    );
  }

  const [{ data: up }, { data: ul }, { data: log }] = await Promise.all([
    supabase.from("user_permissions").select("permission_key").eq("user_id", row.id),
    supabase.from("user_locations").select("location_id").eq("user_id", row.id),
    supabase.from("audit_log").select("id, at, action, entity, details").eq("entity_id", row.id).order("at", { ascending: false }).limit(10),
  ]);
  const perms = (up ?? []).map((x) => x.permission_key);
  const locs = (ul ?? []).map((x) => x.location_id);
  const tabLink = (p: string, label: string) => (
    <Link href={keep({ sel: row.id, p })} role="tab" aria-selected={panelTab === p} className={`-mb-px min-h-11 flex-1 border-b-2 py-2.5 text-center font-semibold ${panelTab === p ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted"}`}>{label}</Link>
  );
  return (
    <div>
      {head(row)}
      <div role="tablist" aria-label="User sections" className="mb-3 flex border-b border-line text-sm">{tabLink("roles", "Role & Permissions")}{tabLink("profile", "Profile")}{tabLink("activity", "Activity Log")}</div>
      {panelTab === "roles" && (
        <div className="space-y-4">
          <div><p className="mb-1 text-sm font-bold">Assigned Role</p><div className="flex items-center gap-2"><RoleBadge name={row.role_name ?? (row.is_admin ? "Admin" : null)} admin={row.is_admin} /><span className="text-xs text-muted">{row.is_admin ? "Full system access with all permissions" : `${n(perms.length)} permission(s)`}</span></div></div>
          <ChangeRoleForm userId={row.id} roleId={row.role_id ?? ""} roles={roles.filter((r) => r.is_active).map((r) => ({ id: r.id, name: r.name }))} />
          <AccessForm key={`${row.id}-${perms.length}-${row.is_admin}-${row.is_active}`} userId={row.id} isActive={row.is_active} isAdmin={row.is_admin} isSelf={row.id === meId} permissions={perms} locationIds={locs} permissionOptions={permissionOptions} locationOptions={locationOptions} />
        </div>
      )}
      {panelTab === "profile" && <ProfileForm key={row.id} userId={row.id} fullName={row.full_name ?? ""} roleId={row.role_id ?? ""} departmentId={row.department_id ?? ""} roles={roles.map((r) => ({ id: r.id, name: r.name }))} departments={departments.filter((d) => d.is_active).map((d) => ({ id: d.id, name: d.name }))} />}
      {panelTab === "activity" && (
        (log ?? []).length === 0 ? <p className="py-4 text-center text-sm text-muted">No changes recorded for this person.</p> : (
          <ul className="divide-y divide-line text-sm">{(log ?? []).map((l) => <li key={l.id} className="flex items-start justify-between gap-2 py-2"><span>{ACTION_LABEL[l.action] ?? l.action}</span><span className="shrink-0 text-xs text-muted">{dateTime(l.at)}</span></li>)}</ul>
        )
      )}
    </div>
  );
}

function FilterSelect({ label, name, value, children }: { label: string; name: string; value: string; children: React.ReactNode }) {
  return (
    <label className="block"><span className="mb-1 block text-xs text-muted">{label}</span>
      <select name={name} defaultValue={value} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm">{children}</select></label>
  );
}

function PageLink({ href, label, active, disabled, children }: { href?: string; label: string; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  const cls = `inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-2 text-sm font-medium ${
    active ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-line bg-surface hover:bg-surface-muted"
  } ${disabled ? "pointer-events-none opacity-40" : ""}`;
  if (disabled || !href) return <span aria-label={label} aria-disabled="true" className={cls}>{children}</span>;
  return <Link href={href} aria-label={label} aria-current={active ? "page" : undefined} className={cls}>{children}</Link>;
}

const TINTS = { blue: "bg-[#e5effd] text-[#1d62c9]", green: "bg-[#e3f6ec] text-[#16824f]", red: "bg-[#fde8e8] text-[#c8302f]", amber: "bg-[#fdf0e1] text-[#b45f08]", violet: "bg-[#ece8fb] text-[#5b3fc0]" } as const;

function Kpi({ icon: Icon, tint, label, value, href, sub }: { icon: LucideIcon; tint: keyof typeof TINTS; label: string; value: string; href: string; sub?: string }) {
  return (
    <Link href={href} className={`${cardClass} flex items-center gap-4 !p-4 transition hover:border-[var(--brand)] hover:shadow-md`}>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${TINTS[tint]}`}><Icon size={26} aria-hidden /></span>
      <span className="min-w-0"><span className="block text-sm text-muted">{label}</span><span className="block text-2xl font-bold leading-9 tracking-tight">{value}</span>{sub && <span className="block text-xs leading-tight text-muted">{sub}</span>}</span>
    </Link>
  );
}

export const metadata = { title: "Users & Roles" };
