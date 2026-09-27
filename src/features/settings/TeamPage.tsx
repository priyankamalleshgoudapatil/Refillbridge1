import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Clock, Mail, UserMinus, UserPlus, UserRoundCog, Users } from 'lucide-react';
import type { Invite, Member } from '@shared/dto.ts';
import { ROLE_LABELS } from '@shared/domain/permissions.ts';
import { inviteSchema, type InviteInput } from '@shared/schemas/index.ts';
import { MFA_REQUIRED_ROLES, PHARMACY_ROLES, PRACTICE_ROLES, type Role } from '@shared/types.ts';
import { useAuth } from '@/app/auth-context';
import { ApiError, friendlyMessage, refillService } from '@/services';
import { Badge } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime, timeAgo } from '@/lib/format';
import { ConfirmModal, CopyField, fadeUp, MemberStatusBadge, MfaShortBadge, SectionHeader } from './components';

type PendingRole = { member: Member; role: Role } | null;

export default function TeamPage() {
  const { user, runWithStepUp } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState<PendingRole>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  const members = useQuery({ queryKey: ['members'], queryFn: () => refillService.listMembers() });
  const roles: readonly Role[] = user?.role === 'pharmacy_admin' ? PHARMACY_ROLES : PRACTICE_ROLES;

  const showError = (title: string) => (err: unknown) => toast.error(title, friendlyMessage(err), err instanceof ApiError ? err.requestId : undefined);

  const roleMutation = useMutation({
    mutationFn: ({ member, role }: { member: Member; role: Role }) => runWithStepUp(() => refillService.updateMemberRole(member.id, role)),
    onSuccess: (m) => {
      toast.success('Role updated', `${m.name} is now ${ROLE_LABELS[m.role].toLowerCase()}.`);
      void qc.invalidateQueries({ queryKey: ['members'] });
    },
    onError: showError("Couldn't change the role"),
    onSettled: () => setPendingRole(null),
  });

  const removeMutation = useMutation({
    mutationFn: (member: Member) => runWithStepUp(() => refillService.removeMember(member.id)),
    onSuccess: (_v, member) => {
      toast.success(member.status === 'invited' ? 'Invite revoked' : 'Member removed', member.status === 'invited' ? `${member.email} can no longer join.` : `${member.name} no longer has access.`);
      void qc.invalidateQueries({ queryKey: ['members'] });
    },
    onError: showError("Couldn't remove this member"),
    onSettled: () => setRemoving(null),
  });

  const inviteButton = (
    <Button icon={<UserPlus className="size-4" aria-hidden />} onClick={() => setInviteOpen(true)}>
      Invite member
    </Button>
  );

  const list = members.data ?? [];
  const displayName = (m: Member) => (m.status === 'invited' || m.name === '—' ? m.email : m.name);

  return (
    <div>
      <SectionHeader title="Team" description="Everyone in your organisation who can sign in. Admins invite people, change roles and remove access." action={inviteButton} />

      {members.isPending ? (
        <SkeletonRows rows={5} />
      ) : members.isError ? (
        <ErrorState title="Couldn't load your team" error={members.error} onRetry={() => void members.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon={<Users className="size-6" aria-hidden />} title="No team members yet" description="Invite colleagues so work doesn't sit with one person." action={inviteButton} />
      ) : (
        <>
          {/* Desktop table */}
          <motion.div {...fadeUp(1)} className="surface hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Team members</caption>
              <thead>
                <tr className="border-b border-line bg-ice-50 text-left text-[12px] uppercase tracking-wide text-ink-400">
                  <th scope="col" className="px-4 py-2.5 font-medium">Member</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Role</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">MFA</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Last active</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id} className="border-b border-line transition-colors last:border-0 hover:bg-ice-50">
                    <td className="max-w-0 px-4 py-3">
                      <MemberIdentity member={m} isYou={m.id === user?.id} />
                    </td>
                    <td className="px-4 py-3">
                      <RoleControl member={m} roles={roles} onChange={(role) => setPendingRole({ member: m, role })} />
                    </td>
                    <td className="px-4 py-3">
                      <MemberStatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3">{m.status === 'invited' ? <span className="text-ink-400">—</span> : <MfaShortBadge enrolled={m.mfaEnrolled} required={MFA_REQUIRED_ROLES.includes(m.role)} />}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-600">
                      {m.lastActive ? <time dateTime={m.lastActive} title={formatDateTime(m.lastActive)}>{timeAgo(m.lastActive)}</time> : <span className="text-ink-400">Never</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" icon={<UserMinus className="size-4" aria-hidden />} aria-label={m.status === 'invited' ? `Revoke invite for ${m.email}` : `Remove ${displayName(m)}`} onClick={() => setRemoving(m)}>
                        {m.status === 'invited' ? 'Revoke' : 'Remove'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden" aria-label="Team members">
            {list.map((m, i) => (
              <motion.li key={m.id} {...fadeUp(i + 1)} className="surface p-4">
                <MemberIdentity member={m} isYou={m.id === user?.id} />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <MemberStatusBadge status={m.status} />
                  {m.status !== 'invited' && <MfaShortBadge enrolled={m.mfaEnrolled} required={MFA_REQUIRED_ROLES.includes(m.role)} />}
                  <Badge tone="muted" icon={<Clock className="size-3.5" aria-hidden />}>
                    {m.lastActive ? `Active ${timeAgo(m.lastActive)}` : 'Never signed in'}
                  </Badge>
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <RoleControl member={m} roles={roles} onChange={(role) => setPendingRole({ member: m, role })} />
                  </div>
                  <Button variant="secondary" size="sm" className="h-10" icon={<UserMinus className="size-4" aria-hidden />} aria-label={m.status === 'invited' ? `Revoke invite for ${m.email}` : `Remove ${displayName(m)}`} onClick={() => setRemoving(m)}>
                    {m.status === 'invited' ? 'Revoke' : 'Remove'}
                  </Button>
                </div>
              </motion.li>
            ))}
          </ul>
        </>
      )}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} roles={roles} runWithStepUp={runWithStepUp} onInvited={() => void qc.invalidateQueries({ queryKey: ['members'] })} />

      <ConfirmModal
        open={pendingRole !== null}
        onClose={() => setPendingRole(null)}
        onConfirm={() => pendingRole && roleMutation.mutate(pendingRole)}
        loading={roleMutation.isPending}
        icon={<UserRoundCog className="size-5" aria-hidden />}
        title={pendingRole ? `Change ${displayName(pendingRole.member)}'s role?` : 'Change role?'}
        description={pendingRole ? `${ROLE_LABELS[pendingRole.member.role]} → ${ROLE_LABELS[pendingRole.role]}` : undefined}
        confirmLabel="Change role"
      >
        <p className="text-sm text-ink-600">Their access changes immediately. {pendingRole && MFA_REQUIRED_ROLES.includes(pendingRole.role) && !pendingRole.member.mfaEnrolled ? 'This role requires two-factor authentication — they will be asked to set it up at next sign-in.' : ''}</p>
      </ConfirmModal>

      <ConfirmModal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && removeMutation.mutate(removing)}
        loading={removeMutation.isPending}
        tone="danger"
        icon={<UserMinus className="size-5" aria-hidden />}
        title={removing ? (removing.status === 'invited' ? `Revoke invite for ${removing.email}?` : `Remove ${displayName(removing)}?`) : 'Remove member?'}
        confirmLabel={removing?.status === 'invited' ? 'Revoke' : 'Remove'}
      >
        <p className="text-sm text-ink-600">
          {removing?.status === 'invited'
            ? 'The invite link stops working straight away.'
            : 'They are signed out everywhere and lose access immediately. Cases they worked on keep their history.'}
        </p>
      </ConfirmModal>
    </div>
  );
}

function MemberIdentity({ member, isYou }: { member: Member; isYou: boolean }) {
  const invited = member.status === 'invited' || member.name === '—';
  const initials = invited
    ? member.email.slice(0, 1).toUpperCase()
    : member.name
        .replace(/^(Dr\.)\s*/i, '')
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[13px] font-semibold text-brand-800" aria-hidden>
        {invited ? <Mail className="size-4" /> : initials}
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate font-medium text-ink-900">
          <span className="truncate">{invited ? 'Pending invite' : member.name}</span>
          {isYou && (
            <Badge tone="brand" className="shrink-0">
              You
            </Badge>
          )}
        </p>
        <p className="truncate text-[13px] text-ink-500">{member.email}</p>
      </div>
    </div>
  );
}

function RoleControl({ member, roles, onChange }: { member: Member; roles: readonly Role[]; onChange: (role: Role) => void }) {
  if (member.status === 'invited') return <Badge tone="neutral">{ROLE_LABELS[member.role]}</Badge>;
  const label = `Role for ${member.name}`;
  return (
    <Select
      label={label}
      hideLabel
      value={member.role}
      onChange={(e) => {
        const next = e.target.value as Role;
        if (next !== member.role) onChange(next);
      }}
      className="h-9 min-w-40 text-[13px]"
    >
      {roles.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </Select>
  );
}

function InviteModal({
  open,
  onClose,
  roles,
  runWithStepUp,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  roles: readonly Role[];
  runWithStepUp: <T>(fn: () => Promise<T>) => Promise<T>;
  onInvited: () => void;
}) {
  const toast = useToast();
  const [invite, setInvite] = useState<Invite | null>(null);
  const defaultRole = roles[roles.length - 1];
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteInput>({ resolver: zodResolver(inviteSchema), mode: 'onTouched', defaultValues: { email: '', role: defaultRole } });

  const mutation = useMutation({
    mutationFn: (v: InviteInput) => runWithStepUp(() => refillService.inviteMember(v)),
    onSuccess: (inv) => {
      setInvite(inv);
      onInvited();
    },
    onError: (err) => toast.error("Couldn't create the invite", friendlyMessage(err), err instanceof ApiError ? err.requestId : undefined),
  });

  const close = () => {
    onClose();
    setTimeout(() => {
      setInvite(null);
      reset({ email: '', role: defaultRole });
      mutation.reset();
    }, 200);
  };
  const again = () => {
    setInvite(null);
    reset({ email: '', role: defaultRole });
    mutation.reset();
  };

  const link = invite ? `${window.location.origin}/accept-invite?token=${encodeURIComponent(invite.token)}` : '';

  return (
    <Modal
      open={open}
      onClose={close}
      title="Invite a team member"
      description={invite ? undefined : 'They get a link to set a password and join your organisation.'}
      icon={<UserPlus className="size-5" aria-hidden />}
      footer={
        invite ? (
          <>
            <Button variant="secondary" onClick={again}>
              Invite another
            </Button>
            <Button onClick={close}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form="invite-form" loading={mutation.isPending}>
              Create invite
            </Button>
          </>
        )
      }
    >
      {invite ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-700">
            Invite created for <span className="font-medium text-ink-900">{invite.email}</span> as <span className="font-medium text-ink-900">{ROLE_LABELS[invite.role].toLowerCase()}</span>.
          </p>
          <CopyField
            label="Invite link"
            value={link}
            hint={
              <>
                Expires in 72 hours ({formatDateTime(invite.expiresAt)}). This demo doesn't send email — share the link yourself. It works once.
              </>
            }
          />
        </div>
      ) : (
        <form id="invite-form" className="space-y-4" noValidate onSubmit={handleSubmit((v) => mutation.mutate(v))}>
          <Input label="Email" type="email" autoComplete="off" required placeholder="name@example.com" data-autofocus error={errors.email?.message} {...register('email')} />
          <Select label="Role" required error={errors.role?.message} hint="You can change this later." {...register('role')}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </form>
      )}
    </Modal>
  );
}
