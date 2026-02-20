"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  RefreshCw,
  Rocket,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Moon,
} from "lucide-react";

interface RailwayDeployment {
  id: string;
  status: string;
  createdAt: string;
  url: string | null;
  meta?: {
    commitHash?: string;
    commitMessage?: string;
  } | null;
}

interface ServiceStatus {
  serviceId: string;
  serviceName: string;
  deployment: RailwayDeployment | null;
  domain: string | null;
  region: string | null;
}

interface RailwayStatusProps {
  serviceId: string;
  environmentId: string;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof CheckCircle2; color: string }
> = {
  SUCCESS: {
    label: "Live",
    icon: CheckCircle2,
    color: "text-orbit-pass",
  },
  DEPLOYING: {
    label: "Deploying",
    icon: Loader2,
    color: "text-orbit-info",
  },
  BUILDING: {
    label: "Building",
    icon: Loader2,
    color: "text-orbit-info",
  },
  FAILED: {
    label: "Failed",
    icon: AlertTriangle,
    color: "text-orbit-fail",
  },
  CRASHED: {
    label: "Crashed",
    icon: AlertTriangle,
    color: "text-orbit-fail",
  },
  SLEEPING: {
    label: "Sleeping",
    icon: Moon,
    color: "text-muted-foreground",
  },
  REMOVED: {
    label: "Removed",
    icon: AlertTriangle,
    color: "text-muted-foreground",
  },
};

function getStatusConfig(status: string) {
  return (
    STATUS_CONFIG[status.toUpperCase()] ?? {
      label: status,
      icon: Clock,
      color: "text-muted-foreground",
    }
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function RailwayStatus({
  serviceId,
  environmentId,
}: RailwayStatusProps) {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [recentDeploys, setRecentDeploys] = useState<RailwayDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/integrations/railway/services/${serviceId}?environmentId=${environmentId}`
      );
      if (res.ok) {
        const data = await res.json();
        setStatus(data.data?.status ?? null);
        setRecentDeploys(data.data?.recentDeployments ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [serviceId, environmentId]);

  async function handleDeploy() {
    setDeploying(true);
    try {
      const res = await fetch(
        `/api/integrations/railway/services/${serviceId}/deploy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ environmentId }),
        }
      );
      if (res.ok) {
        // Refresh status after triggering
        setTimeout(fetchStatus, 2000);
      }
    } finally {
      setDeploying(false);
    }
  }

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className="rounded-xl surface-1 p-6 flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="rounded-xl surface-1 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Unable to load Railway status
        </p>
      </div>
    );
  }

  const deploymentStatus = status.deployment?.status ?? "UNKNOWN";
  const cfg = getStatusConfig(deploymentStatus);
  const StatusIcon = cfg.icon;

  return (
    <div className="rounded-xl surface-1 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon
            className={`h-4 w-4 ${cfg.color} ${
              deploymentStatus === "DEPLOYING" || deploymentStatus === "BUILDING"
                ? "animate-spin"
                : ""
            }`}
          />
          <span className="text-sm font-medium text-foreground">
            {status.serviceName}
          </span>
        </div>
        <Badge variant="outline" className={cfg.color}>
          {cfg.label}
        </Badge>
      </div>

      {status.domain && (
        <div className="text-xs font-mono text-muted-foreground truncate">
          {status.domain}
        </div>
      )}

      {status.deployment && (
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            <span>
              Last deploy: {formatTimeAgo(status.deployment.createdAt)}
            </span>
          </div>
          {status.deployment.meta?.commitHash && (
            <div className="font-mono truncate">
              {status.deployment.meta.commitHash.slice(0, 7)}
              {status.deployment.meta.commitMessage
                ? ` - ${status.deployment.meta.commitMessage}`
                : ""}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleDeploy}
          disabled={deploying}
          className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-1.5"
        >
          <Rocket className="h-3.5 w-3.5" />
          {deploying ? "Deploying..." : "Deploy"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={fetchStatus}
          className="gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
        {status.domain && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => window.open(status.domain!, "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {recentDeploys.length > 1 && (
        <div className="space-y-1 pt-2 border-t border-white/[0.06]">
          <p className="text-xs text-muted-foreground font-medium">
            Recent Deployments
          </p>
          {recentDeploys.slice(1, 4).map((d) => {
            const dCfg = getStatusConfig(d.status);
            const DIcon = dCfg.icon;
            return (
              <div
                key={d.id}
                className="flex items-center justify-between text-xs text-muted-foreground"
              >
                <div className="flex items-center gap-1.5">
                  <DIcon className={`h-3 w-3 ${dCfg.color}`} />
                  <span>{dCfg.label}</span>
                </div>
                <span>{formatTimeAgo(d.createdAt)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
