"use client";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Key,
  Shield,
  Webhook,
  GitBranch,
  Copy,
  Check,
  Trash2,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { Bell } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useMe, useUpdatePreferences, usePushState, useEnablePush, useDisablePush, type NotifPrefs } from "@/lib/webpush-hooks";
import { useCalendarStatus, useDisconnectCalendar } from "@/lib/calendar-sync-hooks";
import { Workflow, Calendar } from "lucide-react";
import { AutomationsTab } from "./_components/AutomationsTab";
import { useAPITokens, useCreateAPIToken, useDeleteAPIToken } from "@/lib/apitokens-hooks";
import { useTOTPStatus, useSetupTOTP, useEnableTOTP, useDisableTOTP } from "@/lib/totp-hooks";
import type { TOTPSetup } from "@/lib/totp-hooks";
import { useWebhooks, useCreateWebhook, useDeleteWebhook } from "@/lib/webhooks-hooks";

const WEBHOOK_EVENTS = [
  "task.created",
  "task.updated",
  "task.deleted",
  "task.completed",
] as const;

// ─── API Tokens Tab ───────────────────────────────────────────────────────────

function APITokensTab() {
  const { data: tokens, isLoading } = useAPITokens();
  const createToken = useCreateAPIToken();
  const deleteToken = useDeleteAPIToken();

  const [createOpen, setCreateOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = () => {
    if (!tokenName.trim()) return;
    createToken.mutate(
      { name: tokenName.trim() },
      {
        onSuccess: (data) => {
          setCreatedToken(data.token);
          setTokenName("");
          toast.success("API token created");
        },
        onError: () => toast.error("Failed to create token"),
      }
    );
  };

  const handleCopy = () => {
    if (!createdToken) return;
    navigator.clipboard.writeText(createdToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setCreatedToken(null);
      setTokenName("");
    }
    setCreateOpen(open);
  };

  const handleDelete = (id: string) => {
    deleteToken.mutate(id, {
      onSuccess: () => toast.success("Token deleted"),
      onError: () => toast.error("Failed to delete token"),
    });
  };

  const list = tokens ?? [];

  return (
    <div className="flex flex-col gap-4 mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Use API tokens to authenticate with the Fayde API from external tools.
        </p>
        <Dialog open={createOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Create token
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create API token</DialogTitle>
            </DialogHeader>
            {createdToken ? (
              <div className="flex flex-col gap-4 py-2">
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Copy this token now — it will never be shown again.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono break-all">
                    {createdToken}
                  </code>
                  <Button size="icon-sm" variant="outline" onClick={handleCopy}>
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 py-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="token-name">Token name</Label>
                  <Input
                    id="token-name"
                    placeholder="e.g. CI/CD pipeline"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              {createdToken ? (
                <Button onClick={() => handleDialogClose(false)}>Done</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => handleDialogClose(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!tokenName.trim() || createToken.isPending}
                  >
                    {createToken.isPending ? "Creating..." : "Create"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl border border-border bg-card">
          <Key className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No API tokens yet</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
          {list.map((token) => (
            <div key={token.id} className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium truncate">{token.name}</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {token.token_prefix}••••••••
                </span>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[11px] text-muted-foreground">
                    {token.last_used_at
                      ? `Used ${formatDistanceToNow(new Date(token.last_used_at), { addSuffix: true })}`
                      : "Never used"}
                  </span>
                  <span className="text-[11px] text-muted-foreground/60">
                    Created {format(new Date(token.created_at), "MMM d, yyyy")}
                  </span>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(token.id)}
                  disabled={deleteToken.isPending}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 2FA Tab ──────────────────────────────────────────────────────────────────

function TwoFATab() {
  const { data: status, isLoading } = useTOTPStatus();
  const setupTOTP = useSetupTOTP();
  const enableTOTP = useEnableTOTP();
  const disableTOTP = useDisableTOTP();

  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [setupData, setSetupData] = useState<TOTPSetup | null>(null);
  const [code, setCode] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!setupData?.qr_url) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQrDataUrl(null);
      return;
    }
    import("qrcode").then((QRCode) =>
      QRCode.toDataURL(setupData.qr_url, { width: 192, margin: 2 })
        .then(setQrDataUrl)
    );
  }, [setupData?.qr_url]);

  const enabled = status?.enabled ?? false;

  const handleGenerate = () => {
    setupTOTP.mutate(undefined, {
      onSuccess: (data) => setSetupData(data),
      onError: () => toast.error("Failed to generate 2FA secret"),
    });
  };

  const handleEnable = () => {
    enableTOTP.mutate(
      { code },
      {
        onSuccess: () => {
          toast.success("2FA enabled");
          setSetupOpen(false);
          setSetupData(null);
          setCode("");
        },
        onError: () => toast.error("Invalid code — try again"),
      }
    );
  };

  const handleDisable = () => {
    disableTOTP.mutate(
      { code },
      {
        onSuccess: () => {
          toast.success("2FA disabled");
          setDisableOpen(false);
          setCode("");
        },
        onError: () => toast.error("Invalid code — try again"),
      }
    );
  };

  const handleSetupClose = (open: boolean) => {
    if (!open) {
      setSetupData(null);
      setCode("");
    }
    setSetupOpen(open);
  };

  const handleDisableClose = (open: boolean) => {
    if (!open) setCode("");
    setDisableOpen(open);
  };

  if (isLoading) {
    return (
      <div className="mt-4 h-32 rounded-xl border border-border bg-card animate-pulse" />
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4">
        <div className="flex items-center gap-3">
          <Shield className={cn("w-5 h-5", enabled ? "text-emerald-500" : "text-muted-foreground")} />
          <div>
            <p className="text-sm font-medium">
              Two-factor authentication
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {enabled
                ? "Your account is secured with 2FA."
                : "Add an extra layer of security to your account."}
            </p>
          </div>
        </div>
        <Badge
          className={cn(
            "text-xs font-medium",
            enabled
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              : "bg-muted text-muted-foreground"
          )}
        >
          {enabled ? "Enabled" : "Disabled"}
        </Badge>
      </div>

      {!enabled ? (
        <Dialog open={setupOpen} onOpenChange={handleSetupClose}>
          <DialogTrigger asChild>
            <Button className="self-start gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Set up 2FA
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Set up two-factor authentication</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              {!setupData ? (
                <p className="text-sm text-muted-foreground">
                  Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.).
                </p>
              ) : (
                <>
                  <div className="flex flex-col items-center gap-3">
                    {qrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qrDataUrl}
                        alt="2FA QR code"
                        className="w-48 h-48 rounded-xl border border-border bg-white p-2"
                      />
                    ) : (
                      <div className="w-48 h-48 rounded-xl border border-border bg-muted animate-pulse" />
                    )}
                    <div className="flex flex-col items-center gap-1">
                      <p className="text-xs text-muted-foreground">Or enter manually:</p>
                      <code className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-mono tracking-widest">
                        {setupData.secret}
                      </code>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="totp-code">Verification code</Label>
                    <Input
                      id="totp-code"
                      placeholder="000000"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => e.key === "Enter" && handleEnable()}
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleSetupClose(false)}>
                Cancel
              </Button>
              {!setupData ? (
                <Button onClick={handleGenerate} disabled={setupTOTP.isPending}>
                  {setupTOTP.isPending ? "Generating..." : "Generate"}
                </Button>
              ) : (
                <Button
                  onClick={handleEnable}
                  disabled={code.length !== 6 || enableTOTP.isPending}
                >
                  {enableTOTP.isPending ? "Enabling..." : "Enable"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <Dialog open={disableOpen} onOpenChange={handleDisableClose}>
          <DialogTrigger asChild>
            <Button variant="destructive" className="self-start gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Disable 2FA
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Disable two-factor authentication</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <p className="text-sm text-muted-foreground">
                Enter your authenticator code to confirm disabling 2FA.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="disable-code">Verification code</Label>
                <Input
                  id="disable-code"
                  placeholder="000000"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleDisable()}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleDisableClose(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDisable}
                disabled={code.length !== 6 || disableTOTP.isPending}
              >
                {disableTOTP.isPending ? "Disabling..." : "Disable"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Webhooks Tab ─────────────────────────────────────────────────────────────

function WebhooksTab() {
  const { data: webhooks, isLoading } = useWebhooks();
  const createWebhook = useCreateWebhook();
  const deleteWebhook = useDeleteWebhook();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    url: "",
    events: [] as string[],
    secret: "",
  });

  const toggleEvent = (event: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(event)
        ? f.events.filter((e) => e !== event)
        : [...f.events, event],
    }));
  };

  const handleCreate = () => {
    if (!form.name.trim() || !form.url.trim() || form.events.length === 0) return;
    createWebhook.mutate(
      {
        name: form.name.trim(),
        url: form.url.trim(),
        events: form.events,
        secret: form.secret.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Webhook created");
          setCreateOpen(false);
          setForm({ name: "", url: "", events: [], secret: "" });
        },
        onError: () => toast.error("Failed to create webhook"),
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteWebhook.mutate(id, {
      onSuccess: () => toast.success("Webhook deleted"),
      onError: () => toast.error("Failed to delete webhook"),
    });
  };

  const handleClose = (open: boolean) => {
    if (!open) setForm({ name: "", url: "", events: [], secret: "" });
    setCreateOpen(open);
  };

  const list = webhooks ?? [];

  return (
    <div className="flex flex-col gap-4 mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Receive HTTP POST callbacks when tasks change.
        </p>
        <Dialog open={createOpen} onOpenChange={handleClose}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Add webhook
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add webhook</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wh-name">Name</Label>
                <Input
                  id="wh-name"
                  placeholder="e.g. Slack notifications"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wh-url">Payload URL</Label>
                <Input
                  id="wh-url"
                  placeholder="https://example.com/webhook"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Events</Label>
                <div className="flex flex-col gap-1.5">
                  {WEBHOOK_EVENTS.map((event) => (
                    <label
                      key={event}
                      className="flex items-center gap-2.5 cursor-pointer group"
                    >
                      <div
                        onClick={() => toggleEvent(event)}
                        className={cn(
                          "w-4 h-4 rounded border transition-colors cursor-pointer flex items-center justify-center",
                          form.events.includes(event)
                            ? "bg-primary border-primary"
                            : "border-input bg-background group-hover:border-primary/50"
                        )}
                      >
                        {form.events.includes(event) && (
                          <Check className="w-2.5 h-2.5 text-primary-foreground" />
                        )}
                      </div>
                      <span className="text-sm font-mono text-muted-foreground">
                        {event}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wh-secret">
                  Secret <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="wh-secret"
                  placeholder="Signing secret"
                  value={form.secret}
                  onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={
                  !form.name.trim() ||
                  !form.url.trim() ||
                  form.events.length === 0 ||
                  createWebhook.isPending
                }
              >
                {createWebhook.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl border border-border bg-card">
          <Webhook className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No webhooks yet</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
          {list.map((wh) => (
            <div key={wh.id} className="flex items-start justify-between px-4 py-3 gap-3">
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{wh.name}</span>
                  <Badge
                    className={cn(
                      "text-[10px] px-1.5 py-0 shrink-0",
                      wh.enabled
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {wh.enabled ? "Active" : "Disabled"}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground font-mono truncate max-w-xs">
                  {wh.url}
                </span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {wh.events.map((ev) => (
                    <Badge
                      key={ev}
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 font-mono"
                    >
                      {ev}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5"
                onClick={() => handleDelete(wh.id)}
                disabled={deleteWebhook.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── GitHub Tab ───────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

function GitHubTab() {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <GitBranch className="w-5 h-5" />
          <h3 className="text-sm font-semibold">Connect GitHub</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Link GitHub issues and pull requests to your tasks using webhooks.
        </p>
        <ol className="flex flex-col gap-3">
          {[
            <>
              In your GitHub repo settings, go to <strong>Webhooks</strong>.
            </>,
            <>
              Set the payload URL to:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                {BASE_URL}/webhooks/github
              </code>
            </>,
            <>
              Set a secret to any value and note it in your{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">.env</code>{" "}
              as{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                GITHUB_WEBHOOK_SECRET
              </code>
              .
            </>,
            <>
              Select the events: <strong>Issues</strong> and <strong>Pull requests</strong>.
            </>,
            <>
              Open any task and use the <strong>GitHub</strong> section to link issues or PRs by number.
            </>,
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm text-muted-foreground leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ─── Notifications Tab ──────────────────────────────────────────────────────

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="min-w-0 pr-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span
          className={cn(
            "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

function NotificationsTab() {
  const { data: me, isLoading } = useMe();
  const updatePrefs = useUpdatePreferences();
  const pushState = usePushState();
  const enablePush = useEnablePush();
  const disablePush = useDisablePush();

  // Chat draft: null until the user edits, then overrides the server value.
  const [chatDraft, setChatDraft] = useState<{ url: string; kind: string } | null>(null);

  if (isLoading || !me) {
    return <div className="mt-4 h-64 rounded-xl border border-border bg-card animate-pulse" />;
  }

  const prefs = me.notif_prefs;
  const chatUrl = chatDraft?.url ?? me.notif_chat_url ?? "";
  const chatKind = chatDraft?.kind ?? me.notif_chat_kind ?? "slack";
  const chatDirty = chatDraft !== null;
  const editChat = (patch: Partial<{ url: string; kind: string }>) =>
    setChatDraft({ url: chatUrl, kind: chatKind, ...patch });

  const setChannel = (key: keyof NotifPrefs, v: boolean) => {
    const next: NotifPrefs = { ...prefs, [key]: v };
    updatePrefs.mutate(
      { notif_prefs: next },
      {
        onSuccess: () => toast.success("Preferences updated"),
        onError: () => toast.error("Failed to update"),
      }
    );
  };

  const togglePush = async (v: boolean) => {
    try {
      if (v) {
        await enablePush.mutateAsync();
        setChannel("web_push", true);
        toast.success("Web push enabled");
      } else {
        await disablePush.mutateAsync();
        setChannel("web_push", false);
        toast.success("Web push disabled");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Push toggle failed");
    }
  };

  const saveChat = () => {
    updatePrefs.mutate(
      { notif_chat_url: chatUrl.trim(), notif_chat_kind: chatKind },
      {
        onSuccess: () => {
          setChatDraft(null);
          toast.success("Chat webhook saved");
        },
        onError: () => toast.error("Failed to save"),
      }
    );
  };

  const pushBusy = enablePush.isPending || disablePush.isPending;

  return (
    <div className="mt-4 flex flex-col gap-5">
      <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
        <ToggleRow
          label="In-app"
          desc="Realtime alerts in the notification bell"
          checked={prefs.in_app}
          onChange={(v) => setChannel("in_app", v)}
        />
        <ToggleRow
          label="Email"
          desc="Send notifications to your email inbox"
          checked={prefs.email}
          onChange={(v) => setChannel("email", v)}
        />
        <ToggleRow
          label="Web push"
          desc={
            pushState.data && !pushState.data.supported
              ? "Not supported in this browser"
              : "Browser push notifications, even when the tab is closed"
          }
          checked={prefs.web_push && !!pushState.data?.subscribed}
          disabled={pushBusy || (pushState.data && !pushState.data.supported)}
          onChange={togglePush}
        />
        <ToggleRow
          label="Slack / Discord"
          desc="Forward notifications to a chat channel"
          checked={prefs.chat}
          disabled={!chatUrl.trim()}
          onChange={(v) => setChannel("chat", v)}
        />
      </div>

      {me.inbox_token && (
        <div className="rounded-xl border border-border bg-card p-5">
          <Label className="text-sm font-medium">Email to task</Label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">
            Send or forward an email to this address to create a task (subject → title, body → description).
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
              u+{me.inbox_token}@admin.sachindra.codes
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(`u+${me.inbox_token}@admin.sachindra.codes`);
                toast.success("Copied");
              }}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <Label className="text-sm font-medium">Chat webhook</Label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">
          Paste an incoming-webhook URL from Slack or Discord.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={chatKind} onValueChange={(v) => editChat({ kind: v })}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="slack">Slack</SelectItem>
              <SelectItem value="discord">Discord</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="https://hooks.slack.com/services/..."
            value={chatUrl}
            onChange={(e) => editChat({ url: e.target.value })}
            className="flex-1"
          />
          <Button onClick={saveChat} disabled={!chatDirty || updatePrefs.isPending}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Calendar Tab ────────────────────────────────────────────────────────────

function CalendarTab() {
  const { data: status, isLoading, refetch } = useCalendarStatus();
  const disconnect = useDisconnectCalendar();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    if (success === "true") {
      refetch();
      toast.success("Google Calendar connected!");
      const p = new URLSearchParams(searchParams.toString());
      p.delete("success");
      p.delete("tab");
      router.replace("/settings?tab=calendar");
    } else if (error) {
      toast.error(`Calendar connection failed: ${error}`);
      const p = new URLSearchParams(searchParams.toString());
      p.delete("error");
      router.replace("/settings?tab=calendar");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    window.location.href = `${BASE_URL}/calendar/connect?token=${token}`;
  };

  const handleDisconnect = () => {
    disconnect.mutate(undefined, {
      onSuccess: () => toast.success("Google Calendar disconnected"),
      onError: () => toast.error("Failed to disconnect Google Calendar"),
    });
  };

  if (isLoading) {
    return <div className="mt-4 h-32 rounded-xl border border-border bg-card animate-pulse" />;
  }

  const connected = status?.connected ?? false;

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <Calendar className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Google Calendar Sync</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Automatically sync your tasks with due dates to your Google Calendar.
        </p>

        {connected ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg w-fit">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Connected as <strong>{status?.email}</strong>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="w-fit"
              onClick={handleDisconnect}
              disabled={disconnect.isPending}
            >
              Disconnect Calendar
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Authorize access to push tasks with deadlines to your Google Calendar.
            </p>
            <Button onClick={handleConnect} className="w-fit">
              Connect Google Calendar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Settings Page ──────────────────────────────────────────────────────────

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") ?? "notifications";

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-in fade-in-0 slide-in-from-bottom-3 duration-400">
        <h2 className="text-xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your account, notifications, and integrations
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => router.replace(`/settings?tab=${v}`)}>
        <TabsList className="bg-muted p-1 rounded-xl">
          <TabsTrigger value="notifications" className="rounded-lg text-xs">
            <Bell className="size-3.5 mr-1.5" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="tokens" className="rounded-lg text-xs">
            <Key className="size-3.5 mr-1.5" />
            API Tokens
          </TabsTrigger>
          <TabsTrigger value="2fa" className="rounded-lg text-xs">
            <Shield className="size-3.5 mr-1.5" />
            2FA
          </TabsTrigger>
          <TabsTrigger value="automations" className="rounded-lg text-xs">
            <Workflow className="size-3.5 mr-1.5" />
            Automations
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="rounded-lg text-xs">
            <Webhook className="size-3.5 mr-1.5" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="github" className="rounded-lg text-xs">
            <GitBranch className="size-3.5 mr-1.5" />
            GitHub
          </TabsTrigger>
          <TabsTrigger value="calendar" className="rounded-lg text-xs">
            <Calendar className="size-3.5 mr-1.5" />
            Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notifications">
          <NotificationsTab />
        </TabsContent>
        <TabsContent value="tokens">
          <APITokensTab />
        </TabsContent>
        <TabsContent value="2fa">
          <TwoFATab />
        </TabsContent>
        <TabsContent value="automations">
          <AutomationsTab />
        </TabsContent>
        <TabsContent value="webhooks">
          <WebhooksTab />
        </TabsContent>
        <TabsContent value="github">
          <GitHubTab />
        </TabsContent>
        <TabsContent value="calendar">
          <CalendarTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
