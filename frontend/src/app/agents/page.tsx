"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Agent {
  name: string;
  description: string;
  purpose: string;
  model_tier: string;
}

const tierColors: Record<string, string> = {
  fast: "bg-green-100 text-green-700",
  balanced: "bg-blue-100 text-blue-700",
  powerful: "bg-purple-100 text-purple-700",
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const data = (await api.listAgents()) as Agent[];
        setAgents(data);
      } catch {
        // API not available
      }
    }
    load();
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Agents</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className="bg-white border border-gray-200 rounded-lg p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900">{agent.name}</h3>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${tierColors[agent.model_tier] || "bg-gray-100"}`}
              >
                {agent.model_tier}
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-2">{agent.description}</p>
            <p className="text-xs text-gray-400">{agent.purpose}</p>
            <div className="mt-3">
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                active
              </span>
            </div>
          </div>
        ))}
        {agents.length === 0 && (
          <p className="text-gray-500 col-span-full">No agents available</p>
        )}
      </div>
    </div>
  );
}
