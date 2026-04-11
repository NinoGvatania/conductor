"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Tool {
  id: string;
  name: string;
  description: string;
  url: string;
  method: string;
  connection_id: string | null;
}

interface Connection {
  id: string;
  name: string;
  description: string;
  base_url: string;
  auth_type: string;
  has_credentials: boolean;
}

/**
 * Hard-coded catalog of popular integrations shown in the "Library" section.
 * Clicking Install opens a credential modal (if the preset needs one) and
 * then creates a Connection row with these preset tools and routes the user
 * to the connection page. This is an MVP registry — extend as we add
 * first-class presets.
 */
interface CredentialField {
  key: string; // field name stored in Connection.credentials
  label: string; // human label in the modal
  placeholder?: string;
  help?: string; // short hint under the input
  type?: "text" | "password";
}

interface LibraryPreset {
  id: string; // stable id for selection state
  name: string;
  description: string;
  icon: string; // emoji
  color: string;
  base_url: string;
  auth_type: string;
  credential_fields: CredentialField[];
  tools: Array<{
    name: string;
    description: string;
    url: string;
    method: string;
  }>;
}

const LIBRARY_PRESETS: LibraryPreset[] = [
  {
    id: "telegram",
    name: "Telegram Bot API",
    description: "Отправка сообщений, получение апдейтов, управление ботами в Telegram",
    icon: "✈️",
    color: "#0088cc",
    base_url: "https://api.telegram.org",
    auth_type: "api_key",
    credential_fields: [
      {
        key: "bot_token",
        label: "Bot Token",
        placeholder: "123456:ABC-DEF...",
        help: "Получи у @BotFather в Telegram",
        type: "password",
      },
    ],
    tools: [
      { name: "send_message", description: "Send a text message to a Telegram chat", url: "https://api.telegram.org/bot{bot_token}/sendMessage", method: "POST" },
      { name: "get_updates", description: "Get new updates from the bot", url: "https://api.telegram.org/bot{bot_token}/getUpdates", method: "GET" },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Постинг сообщений в каналы, работа с пользователями и threads",
    icon: "💬",
    color: "#4a154b",
    base_url: "https://slack.com/api",
    auth_type: "bearer",
    credential_fields: [
      {
        key: "bot_token",
        label: "Bot User OAuth Token",
        placeholder: "xoxb-...",
        help: "Создай Slack App, получи Bot Token в OAuth & Permissions",
        type: "password",
      },
    ],
    tools: [
      { name: "post_message", description: "Post a message to a Slack channel", url: "https://slack.com/api/chat.postMessage", method: "POST" },
      { name: "list_channels", description: "List channels in the workspace", url: "https://slack.com/api/conversations.list", method: "GET" },
    ],
  },
  {
    id: "discord",
    name: "Discord",
    description: "Отправка сообщений и управление серверами Discord",
    icon: "🎮",
    color: "#5865f2",
    base_url: "https://discord.com/api/v10",
    auth_type: "bearer",
    credential_fields: [
      {
        key: "bot_token",
        label: "Bot Token",
        placeholder: "MTk4NjIy...",
        help: "Создай приложение на discord.com/developers, возьми Bot Token",
        type: "password",
      },
    ],
    tools: [
      { name: "send_channel_message", description: "Send a message to a Discord channel", url: "https://discord.com/api/v10/channels/{channel_id}/messages", method: "POST" },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Чтение и создание страниц, баз данных, блоков",
    icon: "📝",
    color: "#000000",
    base_url: "https://api.notion.com/v1",
    auth_type: "bearer",
    credential_fields: [
      {
        key: "integration_token",
        label: "Internal Integration Token",
        placeholder: "secret_...",
        help: "notion.so/my-integrations → New integration",
        type: "password",
      },
    ],
    tools: [
      { name: "query_database", description: "Query a Notion database for pages", url: "https://api.notion.com/v1/databases/{database_id}/query", method: "POST" },
      { name: "create_page", description: "Create a new page in Notion", url: "https://api.notion.com/v1/pages", method: "POST" },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Работа с issues, PR, репозиториями через GitHub API",
    icon: "🐙",
    color: "#24292f",
    base_url: "https://api.github.com",
    auth_type: "bearer",
    credential_fields: [
      {
        key: "personal_access_token",
        label: "Personal Access Token",
        placeholder: "ghp_...",
        help: "github.com/settings/tokens → Generate new token",
        type: "password",
      },
    ],
    tools: [
      { name: "list_issues", description: "List issues in a repository", url: "https://api.github.com/repos/{owner}/{repo}/issues", method: "GET" },
      { name: "create_issue", description: "Create an issue in a repository", url: "https://api.github.com/repos/{owner}/{repo}/issues", method: "POST" },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Платежи, подписки, клиенты в Stripe",
    icon: "💳",
    color: "#635bff",
    base_url: "https://api.stripe.com/v1",
    auth_type: "bearer",
    credential_fields: [
      {
        key: "secret_key",
        label: "Secret Key",
        placeholder: "sk_live_... or sk_test_...",
        help: "dashboard.stripe.com/apikeys",
        type: "password",
      },
    ],
    tools: [
      { name: "list_customers", description: "List Stripe customers", url: "https://api.stripe.com/v1/customers", method: "GET" },
      { name: "create_payment_intent", description: "Create a payment intent", url: "https://api.stripe.com/v1/payment_intents", method: "POST" },
    ],
  },
  {
    id: "openweather",
    name: "OpenWeather",
    description: "Погода по координатам и городам",
    icon: "☁️",
    color: "#f97316",
    base_url: "https://api.openweathermap.org/data/2.5",
    auth_type: "api_key",
    credential_fields: [
      {
        key: "api_key",
        label: "API Key",
        placeholder: "your-32-char-api-key",
        help: "home.openweathermap.org/api_keys",
        type: "password",
      },
    ],
    tools: [
      { name: "get_weather", description: "Get current weather for a city", url: "https://api.openweathermap.org/data/2.5/weather", method: "GET" },
    ],
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    description: "Чтение и запись ячеек в таблицах Google",
    icon: "📊",
    color: "#0f9d58",
    base_url: "https://sheets.googleapis.com/v4",
    auth_type: "bearer",
    credential_fields: [
      {
        key: "access_token",
        label: "OAuth Access Token",
        placeholder: "ya29....",
        help: "Получи через OAuth 2.0 Playground или собственный OAuth flow",
        type: "password",
      },
    ],
    tools: [
      { name: "read_range", description: "Read values from a spreadsheet range", url: "https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{range}", method: "GET" },
      { name: "append_row", description: "Append a row to a spreadsheet", url: "https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{range}:append", method: "POST" },
    ],
  },
];

export default function ToolsPage() {
  const router = useRouter();
  const [tools, setTools] = useState<Tool[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [tab, setTab] = useState<"installed" | "library">("installed");
  const [search, setSearch] = useState("");
  const [installing, setInstalling] = useState<string | null>(null);
  // Modal state: which preset is being installed, and what the user typed
  // into each credential field. null = modal closed.
  const [installPreset, setInstallPreset] = useState<LibraryPreset | null>(null);
  const [credValues, setCredValues] = useState<Record<string, string>>({});

  async function refresh() {
    try {
      const [t, c] = await Promise.all([api.listTools(), api.listConnections()]);
      setTools((t as Tool[]) || []);
      setConnections((c as Connection[]) || []);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // Map each connection to its tools for quick count lookup
  const toolsByConnection = useMemo(() => {
    const map: Record<string, Tool[]> = {};
    for (const t of tools) {
      if (t.connection_id) {
        (map[t.connection_id] = map[t.connection_id] || []).push(t);
      }
    }
    return map;
  }, [tools]);

  // Presets whose name matches an existing connection should show "Installed"
  const installedPresetNames = useMemo(
    () => new Set(connections.map((c) => c.name.toLowerCase())),
    [connections],
  );

  async function deleteConnection(id: string) {
    if (!confirm("Удалить эту интеграцию и все её инструменты?")) return;
    try {
      await api.deleteConnection(id);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  function openInstallModal(preset: LibraryPreset) {
    if (installingPresetActive(preset)) return;
    // Seed every credential field with an empty value so controlled inputs
    // don't flip between uncontrolled ↔ controlled on first keystroke.
    const seed: Record<string, string> = {};
    for (const f of preset.credential_fields) seed[f.key] = "";
    setCredValues(seed);
    setInstallPreset(preset);
  }

  function closeInstallModal() {
    setInstallPreset(null);
    setCredValues({});
  }

  async function confirmInstall() {
    if (!installPreset) return;
    const preset = installPreset;

    // Require every declared field — no silent empty installs. If a field
    // is marked optional in the future, the check can be per-field.
    for (const f of preset.credential_fields) {
      if (!credValues[f.key]?.trim()) {
        alert(`Заполни поле: ${f.label}`);
        return;
      }
    }

    setInstalling(preset.id);
    try {
      // 1. Create the Connection row with the entered credentials
      const conn = (await api.createConnection({
        name: preset.name,
        description: preset.description,
        base_url: preset.base_url,
        auth_type: preset.auth_type,
        credentials: { ...credValues },
      })) as { id: string; name: string };

      // 2. Create each preset tool attached to that connection
      for (const t of preset.tools) {
        await api.createTool({
          name: t.name,
          description: t.description,
          url: t.url,
          method: t.method,
          connection_id: conn.id,
        });
      }

      closeInstallModal();
      await refresh();
      // Switch back to Installed so the user immediately sees their new card
      setTab("installed");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to install");
    } finally {
      setInstalling(null);
    }
  }

  function installingPresetActive(preset: LibraryPreset): boolean {
    return installedPresetNames.has(preset.name.toLowerCase());
  }

  const filteredConnections = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return connections;
    return connections.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q),
    );
  }, [connections, search]);

  const filteredPresets = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return LIBRARY_PRESETS;
    return LIBRARY_PRESETS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
    );
  }, [search]);

  // Deterministic fallback icon for custom connections (no preset letter icon)
  function iconFor(name: string): { letter: string; color: string } {
    const letter = (name[0] || "?").toUpperCase();
    const palette = ["#6366f1", "#0cce6b", "#f5a623", "#ec4899", "#3291ff", "#a855f7", "#14b8a6"];
    const idx = (name.charCodeAt(0) || 0) % palette.length;
    return { letter, color: palette[idx] };
  }

  return (
    <div>
      {/* Credential prompt modal for library installs */}
      {installPreset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={closeInstallModal}
        >
          <div
            className="w-full max-w-md rounded-lg flex flex-col"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 flex items-start gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div
                className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 text-xl"
                style={{
                  background: installPreset.color + "20",
                  border: `1px solid ${installPreset.color}40`,
                }}
              >
                {installPreset.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                  Install {installPreset.name}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Введи данные для доступа — они хранятся только у тебя
                </p>
              </div>
              <button
                onClick={closeInstallModal}
                className="text-xl leading-none px-2"
                style={{ color: "var(--text-muted)" }}
              >
                ×
              </button>
            </div>

            <div className="px-6 py-4 space-y-3">
              {installPreset.credential_fields.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Эта интеграция не требует ключей — просто нажми Install.
                </p>
              ) : (
                installPreset.credential_fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                      {field.label} <span style={{ color: "#ee4444" }}>*</span>
                    </label>
                    <input
                      type={field.type || "text"}
                      value={credValues[field.key] || ""}
                      onChange={(e) => setCredValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 rounded-md text-sm font-mono"
                      style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                      }}
                      autoComplete="off"
                    />
                    {field.help && (
                      <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                        {field.help}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div
              className="px-6 py-3 flex items-center justify-between gap-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {installPreset.tools.length} tool{installPreset.tools.length === 1 ? "" : "s"} will be added
              </span>
              <div className="flex gap-2">
                <button
                  onClick={closeInstallModal}
                  className="text-xs px-3 py-1.5 rounded-md"
                  style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmInstall}
                  disabled={installing === installPreset.id}
                  className="text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-50"
                  style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
                >
                  {installing === installPreset.id ? "Installing..." : "Install"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Integrations
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Подключи готовые интеграции или создай свою
          </p>
        </div>
        <Link
          href="/tools/new"
          className="px-3 py-1.5 rounded-md text-sm font-medium"
          style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
        >
          New Integration
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <button
          onClick={() => setTab("installed")}
          className="px-4 py-2 text-sm"
          style={{
            color: tab === "installed" ? "var(--text-primary)" : "var(--text-muted)",
            fontWeight: tab === "installed" ? 500 : 400,
            borderBottom: tab === "installed" ? "2px solid var(--text-primary)" : "2px solid transparent",
            marginBottom: "-1px",
          }}
        >
          Installed ({connections.length})
        </button>
        <button
          onClick={() => setTab("library")}
          className="px-4 py-2 text-sm"
          style={{
            color: tab === "library" ? "var(--text-primary)" : "var(--text-muted)",
            fontWeight: tab === "library" ? 500 : 400,
            borderBottom: tab === "library" ? "2px solid var(--text-primary)" : "2px solid transparent",
            marginBottom: "-1px",
          }}
        >
          Library ({LIBRARY_PRESETS.length})
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === "installed" ? "Search installed integrations..." : "Search library..."}
          className="w-full px-4 py-2 rounded-md text-sm"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {tab === "installed" ? (
        filteredConnections.length === 0 ? (
          <div className="rounded-lg py-16 text-center" style={{ border: "1px solid var(--border)" }}>
            <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
              {connections.length === 0 ? "Ни одной интеграции пока не установлено" : "Ничего не найдено"}
            </p>
            {connections.length === 0 && (
              <button
                onClick={() => setTab("library")}
                className="text-xs px-3 py-1.5 rounded-md mt-2"
                style={{ color: "var(--accent-light, #3291ff)" }}
              >
                Browse library →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredConnections.map((conn) => {
              const connTools = toolsByConnection[conn.id] || [];
              const { letter, color } = iconFor(conn.name);
              return (
                <div
                  key={conn.id}
                  className="rounded-lg p-4 flex items-start gap-3"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                >
                  <div
                    className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 text-base font-semibold text-white"
                    style={{ background: color }}
                  >
                    {letter}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        href={`/tools/connections/${conn.id}`}
                        className="text-sm font-semibold truncate hover:underline"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {conn.name}
                      </Link>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                        style={{
                          background: conn.has_credentials ? "rgba(12,206,107,0.1)" : "rgba(245,158,11,0.1)",
                          color: conn.has_credentials ? "#0cce6b" : "#f59e0b",
                        }}
                      >
                        {conn.has_credentials ? "Connected" : "Setup needed"}
                      </span>
                    </div>
                    {conn.description && (
                      <p className="text-xs line-clamp-2 mb-2" style={{ color: "var(--text-muted)" }}>
                        {conn.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {connTools.length} tool{connTools.length === 1 ? "" : "s"}
                      </span>
                      <div className="flex gap-2">
                        <Link
                          href={`/tools/connections/${conn.id}`}
                          className="text-[11px]"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Configure
                        </Link>
                        <button
                          onClick={() => deleteConnection(conn.id)}
                          className="text-[11px]"
                          style={{ color: "#ee4444" }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredPresets.map((preset) => {
            const isInstalled = installingPresetActive(preset);
            const isBusy = installing === preset.id;
            return (
              <div
                key={preset.id}
                className="rounded-lg p-4 flex items-start gap-3"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                <div
                  className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 text-xl"
                  style={{ background: preset.color + "20", border: `1px solid ${preset.color}40` }}
                >
                  {preset.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {preset.name}
                    </span>
                    {isInstalled ? (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded shrink-0"
                        style={{ background: "rgba(12,206,107,0.15)", color: "#0cce6b" }}
                      >
                        ✓ Installed
                      </span>
                    ) : (
                      <button
                        onClick={() => openInstallModal(preset)}
                        disabled={isBusy}
                        className="text-[11px] px-2 py-0.5 rounded shrink-0 disabled:opacity-50"
                        style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
                      >
                        {isBusy ? "Installing..." : "+ Install"}
                      </button>
                    )}
                  </div>
                  <p className="text-xs line-clamp-2 mb-2" style={{ color: "var(--text-muted)" }}>
                    {preset.description}
                  </p>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {preset.tools.length} tool{preset.tools.length === 1 ? "" : "s"} · {preset.auth_type}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
