"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { fetchModules, updateModules } from "@/lib/api";
import type { NormalizedModulesConfig } from "@menu/schemas";

export default function ModulesPage() {
  const [modules, setModules] = useState<NormalizedModulesConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchModules().then((res) => setModules(res.modules)).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function save(next: NormalizedModulesConfig) {
    setModules(next);
    setSaving(true);
    setError(null);
    try {
      const res = await updateModules(next);
      setModules(res.modules);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!modules) return <div className="p-6 text-sm text-gray-500">{error ?? "Loading modules..."}</div>;

  return (
    <main className="p-6 max-w-3xl">
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-wide text-primary">Modules</div>
        <h1 className="text-2xl font-bold text-gray-900">Modules</h1>
        <p className="text-sm text-gray-500 mt-1">Enable or hide optional restaurant features.</p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      <div className="space-y-4">
        <ModuleCard
          title="Ordering"
          description="Let diners build a table order summary. Sending orders is coming later."
          enabled={modules.ordering.enabled}
          onToggle={(enabled) => save({ ...modules, ordering: { ...modules.ordering, enabled } })}
        >
          <label className="block text-sm font-medium text-gray-700 mt-4">
            Mode
            <select
              className="mt-1 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2"
              value={modules.ordering.mode}
              onChange={(e) => save({ ...modules, ordering: { ...modules.ordering, mode: e.target.value as "summary" } })}
              disabled={!modules.ordering.enabled || saving}
            >
              <option value="summary">Summary only</option>
            </select>
          </label>
        </ModuleCard>

        <ModuleCard
          title="AI assistant"
          description="Show Tony chat on the public menu."
          enabled={modules.ai.enabled}
          onToggle={(enabled) => save({ ...modules, ai: { ...modules.ai, enabled, voiceEnabled: enabled ? modules.ai.voiceEnabled : false } })}
        >
          <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={modules.ai.voiceEnabled}
              disabled={!modules.ai.enabled || saving}
              onChange={(e) => save({ ...modules, ai: { ...modules.ai, voiceEnabled: e.target.checked } })}
            />
            Voice dictation
          </label>
        </ModuleCard>

        <ModuleCard
          title="Analytics"
          description="Track anonymous item views and show the analytics dashboard."
          enabled={modules.analytics.enabled}
          onToggle={(enabled) => save({ ...modules, analytics: { enabled } })}
        />
      </div>
    </main>
  );
}

function ModuleCard({ title, description, enabled, onToggle, children }: { title: string; description: string; enabled: boolean; onToggle: (enabled: boolean) => void; children?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          Enabled
        </label>
      </div>
      {children}
    </section>
  );
}
