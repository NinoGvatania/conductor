"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

interface Trigger {
  id: string;
  workflow_id: string;
  trigger_type: string;
  name: string;
  config: Record<string, string>;
  enabled: boolean;
  webhook_secret: string | null;
  webhook_url: string | null;
  telegram_url: string | null;
  last_triggered_at: string | null;
}

interface WorkflowInfo {
  name: string;
}

export default function TriggersPage() {
  const params = useParams();
  const workflowId = params.id as string;
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<"telegram" | "webhook">("webhook");
  const [createName, setCreateName] = useState("");
  const [botToken, setBotToken] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function refresh() {
    try {
      const [t, w] = await Promise.all([
        api.listTriggers(workflowId) as Promise<Trigger[]>,
        api.getWorkflow(workflowId) as Promise<WorkflowInfo>,
      ]);
      setTriggers(t || []);
      setWorkflow(w);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  async function handleCreate() {
    setCreating(true);
    try {
      const config: Record<string, string> = {};
      if (createType === "telegram") {
        if (!botToken.trim()) {
          alert("Bot Token is required for Telegram triggers");
          return;
        }
        config.bot_token = botToken.trim();
        if (publicUrl.trim()) config.public_url = publicUrl.trim();
      }

      await api.createTrigger(workflowId, {
        trigger_type: createType,
        name: createName.trim() || `${createType === "telegram" ? "Telegram" : "Webhook"} trigger`,
        config,
      });

      setShowCreate(false);
      setCreateName("");
      setBotToken("");
      setPublicUrl("");
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create trigger");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(trigger: Trigger) {
    try {
      await api.updateTrigger(trigger.id, { enabled: !trigger.enabled });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this trigger?")) return;
    try {
      await api.deleteTrigger(id);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  const apiBase = typeof window !== "undefined" ? window.location.origin : "";

  if (loading) return <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</p>;

  const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };
  const inputStyle = { background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="max-w-3xl">
      <Link href="/workflows" className="text-xs mb-2 inline-block" style={{ color: "var(--text-muted)" }}>
        ← Workflows
      </Link>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Triggers
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {workflow?.name || "Workflow"} — автоматический запуск по событиям
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 rounded-md text-sm font-medium"
          style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
        >
          + Add Trigger
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-md rounded-lg"
            style={cardStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                New Trigger
              </h3>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Привяжи воркфлоу к событию
              </p>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Type selector */}
              <div>
                <label className="block text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                  Type
                </label>
                <div className="flex gap-2">
                  {(["webhook", "telegram"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setCreateType(t)}
                      className="flex-1 px-3 py-2 rounded-md text-sm text-center capitalize"
                      style={{
                        background: createType === t ? "var(--bg-hover)" : "var(--bg-secondary)",
                        border: `1px solid ${createType === t ? "var(--text-primary)" : "var(--border)"}`,
                        color: createType === t ? "var(--text-primary)" : "var(--text-muted)",
                      }}
                    >
                      {t === "telegram" ? "✈️ Telegram" : "🔗 Webhook"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                  Name (optional)
                </label>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder={createType === "telegram" ? "My Telegram Bot" : "AmoCRM Webhook"}
                  className="w-full px-3 py-2 rounded-md text-sm"
                  style={inputStyle}
                />
              </div>

              {/* Telegram-specific fields */}
              {createType === "telegram" && (
                <>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                      Bot Token <span style={{ color: "#ee4444" }}>*</span>
                    </label>
                    <input
                      type="password"
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder="123456:ABC-DEF..."
                      className="w-full px-3 py-2 rounded-md text-sm font-mono"
                      style={inputStyle}
                    />
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                      Получи у @BotFather в Telegram
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                      Public URL (for auto-registration)
                    </label>
                    <input
                      value={publicUrl}
                      onChange={(e) => setPublicUrl(e.target.value)}
                      placeholder="https://your-server.com"
                      className="w-full px-3 py-2 rounded-md text-sm"
                      style={inputStyle}
                    />
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                      Если указан — вебхук зарегистрируется в Telegram автоматически. Иначе зарегистрируй вручную.
                    </p>
                  </div>
                </>
              )}

              {createType === "webhook" && (
                <p className="text-xs rounded-md p-3" style={{ background: "var(--bg-secondary)", color: "var(--text-muted)" }}>
                  После создания ты получишь уникальный URL и секрет. Внешний сервис (AmoCRM, Stripe, GitHub)
                  будет слать POST на этот URL — каждый запрос запустит воркфлоу с payload как входными данными.
                </p>
              )}
            </div>

            <div
              className="px-6 py-3 flex justify-end gap-2"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <button
                onClick={() => setShowCreate(false)}
                className="text-xs px-3 py-1.5 rounded-md"
                style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || (createType === "telegram" && !botToken.trim())}
                className="text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-50"
                style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
              >
                {creating ? "Creating..." : "Create Trigger"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Triggers list */}
      {triggers.length === 0 ? (
        <div className="rounded-lg py-16 text-center" style={cardStyle}>
          <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
            Нет триггеров
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Добавь Telegram бота или Webhook чтобы запускать воркфлоу автоматически
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {triggers.map((trigger) => (
            <div key={trigger.id} className="rounded-lg p-4" style={cardStyle}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {trigger.trigger_type === "telegram" ? "✈️" : "🔗"}
                  </span>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {trigger.name}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {trigger.trigger_type.toUpperCase()}
                      {trigger.last_triggered_at && ` · Last: ${new Date(trigger.last_triggered_at).toLocaleString()}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(trigger)}
                    className="text-[11px] px-2 py-0.5 rounded"
                    style={{
                      background: trigger.enabled ? "rgba(12,206,107,0.1)" : "var(--bg-secondary)",
                      color: trigger.enabled ? "#0cce6b" : "var(--text-muted)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {trigger.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    onClick={() => handleDelete(trigger.id)}
                    className="text-[11px] px-2 py-0.5 rounded"
                    style={{ color: "#ee4444", border: "1px solid var(--border)" }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Webhook details */}
              {trigger.trigger_type === "webhook" && trigger.webhook_url && (
                <div className="space-y-2">
                  <div className="rounded-md p-3" style={{ background: "var(--bg-secondary)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                        Webhook URL
                      </span>
                      <button
                        onClick={() => copyToClipboard(`${apiBase}${trigger.webhook_url}`, `url-${trigger.id}`)}
                        className="text-[10px]"
                        style={{ color: "var(--accent-light, #3291ff)" }}
                      >
                        {copied === `url-${trigger.id}` ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <code className="text-xs block truncate" style={{ color: "var(--text-primary)" }}>
                      {apiBase}{trigger.webhook_url}
                    </code>
                  </div>
                  {trigger.webhook_secret && (
                    <div className="rounded-md p-3" style={{ background: "var(--bg-secondary)" }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                          Secret (header X-Webhook-Secret)
                        </span>
                        <button
                          onClick={() => copyToClipboard(trigger.webhook_secret!, `secret-${trigger.id}`)}
                          className="text-[10px]"
                          style={{ color: "var(--accent-light, #3291ff)" }}
                        >
                          {copied === `secret-${trigger.id}` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <code className="text-xs block truncate" style={{ color: "var(--text-primary)" }}>
                        {trigger.webhook_secret}
                      </code>
                    </div>
                  )}
                </div>
              )}

              {/* Telegram details */}
              {trigger.trigger_type === "telegram" && (
                <div className="rounded-md p-3" style={{ background: "var(--bg-secondary)" }}>
                  <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                    Bot Token
                  </div>
                  <code className="text-xs" style={{ color: "var(--text-primary)" }}>
                    {trigger.config.bot_token || "***"}
                  </code>
                  {trigger.telegram_url && (
                    <div className="mt-2">
                      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                        Telegram Webhook URL
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs truncate flex-1" style={{ color: "var(--text-primary)" }}>
                          {apiBase}{trigger.telegram_url}
                        </code>
                        <button
                          onClick={() => copyToClipboard(`${apiBase}${trigger.telegram_url}`, `tg-${trigger.id}`)}
                          className="text-[10px] shrink-0"
                          style={{ color: "var(--accent-light, #3291ff)" }}
                        >
                          {copied === `tg-${trigger.id}` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                        Зарегистрируй этот URL через setWebhook в Telegram API если автоматическая регистрация не сработала
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
