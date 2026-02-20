"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Loader2, Train, Globe } from "lucide-react";

interface RailwayService {
  id: string;
  name: string;
}

interface RailwayEnvironment {
  id: string;
  name: string;
}

interface RailwayEnvironmentPickerProps {
  onSelect: (url: string, serviceName: string) => void;
}

export function RailwayEnvironmentPicker({
  onSelect,
}: RailwayEnvironmentPickerProps) {
  const [loading, setLoading] = useState(false);
  const [projectData, setProjectData] = useState<{
    services: RailwayService[];
    environments: RailwayEnvironment[];
  } | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedEnv, setSelectedEnv] = useState<string | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [loadingDomain, setLoadingDomain] = useState(false);

  useEffect(() => {
    loadProjectData();
  }, []);

  async function loadProjectData() {
    setLoading(true);
    try {
      const connRes = await fetch("/api/integrations/railway/connect");
      if (!connRes.ok) return;
      const connData = await connRes.json();
      const railwayProjectId = connData.data?.railwayProjectId;
      if (!railwayProjectId) return;

      const projRes = await fetch("/api/integrations/railway/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ railwayProjectId }),
      });
      if (projRes.ok) {
        const projData = await projRes.json();
        setProjectData({
          services: projData.data?.services ?? [],
          environments: projData.data?.environments ?? [],
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadDomain(serviceId: string, environmentId: string) {
    setLoadingDomain(true);
    setDomain(null);
    try {
      const res = await fetch(
        `/api/integrations/railway/services/${serviceId}?environmentId=${environmentId}`
      );
      if (res.ok) {
        const data = await res.json();
        const url = data.data?.status?.domain ?? null;
        setDomain(url);
        if (url) {
          const serviceName =
            projectData?.services.find((s) => s.id === serviceId)?.name ??
            "Railway Service";
          onSelect(url, serviceName);
        }
      }
    } finally {
      setLoadingDomain(false);
    }
  }

  function handleServiceChange(serviceId: string) {
    setSelectedService(serviceId);
    setDomain(null);
    if (selectedEnv) {
      loadDomain(serviceId, selectedEnv);
    }
  }

  function handleEnvChange(envId: string) {
    setSelectedEnv(envId);
    setDomain(null);
    if (selectedService) {
      loadDomain(selectedService, envId);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading Railway services...
      </div>
    );
  }

  if (!projectData || projectData.services.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-lg bg-white/[0.02] p-4 border border-white/[0.06]">
      <div className="flex items-center gap-2">
        <Train className="h-3.5 w-3.5 text-muted-foreground" />
        <Label className="text-xs font-medium text-foreground">
          Auto-fill from Railway
        </Label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Service</Label>
          <select
            value={selectedService ?? ""}
            onChange={(e) => handleServiceChange(e.target.value)}
            className="w-full text-sm bg-white/[0.04] border border-white/[0.06] rounded-md px-3 py-1.5 text-foreground"
          >
            <option value="">Select service...</option>
            {projectData.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Environment</Label>
          <select
            value={selectedEnv ?? ""}
            onChange={(e) => handleEnvChange(e.target.value)}
            className="w-full text-sm bg-white/[0.04] border border-white/[0.06] rounded-md px-3 py-1.5 text-foreground"
          >
            <option value="">Select environment...</option>
            {projectData.environments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadingDomain && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Fetching domain...
        </div>
      )}

      {domain && (
        <div className="flex items-center gap-2 text-xs">
          <Globe className="h-3 w-3 text-orbit-pass" />
          <span className="font-mono text-orbit-pass truncate">{domain}</span>
        </div>
      )}

      {selectedService && selectedEnv && !loadingDomain && !domain && (
        <p className="text-xs text-muted-foreground">
          No public domain found for this service/environment.
        </p>
      )}
    </div>
  );
}
