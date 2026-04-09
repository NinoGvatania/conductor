"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatCost, formatDate } from "@/lib/utils";

interface Run {
  id: string;
  workflow_id: string;
  status: string;
  total_cost_usd: number;
  total_tokens: number;
  total_steps: number;
  created_at: string;
}

const statusColors: Record<string, string> = {
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  paused: "bg-yellow-100 text-yellow-700",
};

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = (await api.listRuns(filter || undefined)) as Run[];
        setRuns(data);
      } catch {
        // API not available
      }
    }
    load();
  }, [filter]);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Runs</h2>

      <div className="mb-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="">All</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="paused">Paused</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                Workflow
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                Cost
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                Steps
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {runs.map((run) => (
              <tr key={run.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusColors[run.status] || "bg-gray-100 text-gray-700"}`}
                  >
                    {run.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/runs/${run.id}`}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    {run.workflow_id}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {formatCost(run.total_cost_usd)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {run.total_steps}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {run.created_at ? formatDate(run.created_at) : "-"}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  No runs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
