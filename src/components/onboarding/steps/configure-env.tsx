"use client";

import { Pending } from "@/components/telemetry/pending";
import { useState } from "react";
import { Eye, EyeOff, ChevronRight, Globe, Key, SkipForward, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfigureEnvProps {
  projectId: string;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function ConfigureEnv({ projectId, onContinue, onSkip, onBack }: ConfigureEnvProps) {
  const [stagingUrl, setStagingUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [authMethod, setAuthMethod] = useState<"credentials" | "apikey" | "none">("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const validateUrl = (value: string) => {
    setStagingUrl(value);
    if (value.trim() && !isValidUrl(value)) {
      setUrlError("Please enter a valid URL (e.g. https://staging.example.com)");
    } else {
      setUrlError(null);
    }
  };

  const isValid = stagingUrl.trim().length > 0 && isValidUrl(stagingUrl) && !urlError;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/environments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Staging",
          type: "staging",
          url: stagingUrl.trim(),
          isDefault: true,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error?.message ?? json.error ?? "Failed to save environment");
        return;
      }

      // Save auth credentials as secrets with standard key names
      if (authMethod === "credentials" && (username || password)) {
        await saveSecrets(projectId, {
          TEST_EMAIL: username,
          TEST_PASSWORD: password,
        });
      } else if (authMethod === "apikey" && apiKey) {
        await saveSecrets(projectId, { TEST_API_KEY: apiKey });
      }

      onContinue();
    } catch {
      setError("Failed to connect to server");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <h2 className="mb-2 text-balance text-[22px] font-medium tracking-display">
          Configure environment
        </h2>
        <p className="text-sm text-muted-foreground">
          Point Orbit to your staging or preview environment so it can run tests
          against a live application.
        </p>
      </div>

      {error && (
        <div className="w-full mb-4 flex items-center gap-2 text-sm text-orbit-fail bg-orbit-fail/10 rounded-md px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="w-full space-y-5">
        <div className="space-y-2">
          <Label htmlFor="staging-url" className="flex items-center gap-2 text-sm">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            Staging / Preview URL
          </Label>
          <Input
            id="staging-url"
            placeholder="https://staging.yourapp.com"
            value={stagingUrl}
            onChange={(e) => validateUrl(e.target.value)}
            className={cn("bg-background", urlError && "border-orbit-fail")}
          />
          {urlError && (
            <p className="text-xs text-orbit-fail">{urlError}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm">
            <Key className="h-3.5 w-3.5 text-muted-foreground" />
            Authentication (optional)
          </Label>
          <div className="flex gap-2">
            {(["none", "credentials", "apikey"] as const).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setAuthMethod(method)}
                className={cn(
                  "flex-1 px-3 py-2 rounded-md text-xs font-medium border transition-colors",
                  authMethod === method
                    ? "border-tm-line-strong bg-foreground/[0.06] text-foreground"
                    : "border-transparent bg-muted/30 text-muted-foreground hover:bg-muted/40"
                )}
              >
                {method === "none" && "None"}
                {method === "credentials" && "Username / Password"}
                {method === "apikey" && "API Key"}
              </button>
            ))}
          </div>
        </div>

        {authMethod === "credentials" && (
          <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="space-y-2">
              <Label htmlFor="env-username" className="text-sm">Username</Label>
              <Input
                id="env-username"
                placeholder="test-user@example.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="env-password" className="text-sm">Password</Label>
              <div className="relative">
                <Input
                  id="env-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-background pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {authMethod === "apikey" && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <Label htmlFor="env-apikey" className="text-sm">API Key</Label>
            <div className="relative">
              <Input
                id="env-apikey"
                type={showApiKey ? "text" : "password"}
                placeholder="sk_test_..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="bg-background pr-9"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((p) => !p)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mt-8">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="outline"
          onClick={onSkip}
          className="gap-2 text-muted-foreground"
        >
          <SkipForward className="h-3.5 w-3.5" />
          Skip for now
        </Button>
        <Button
          className="bg-primary hover:bg-primary/85 text-primary-foreground gap-2"
          size="lg"
          disabled={!isValid || saving}
          onClick={handleSave}
        >
          {saving ? (
            <>
              <Pending />
              Saving...
            </>
          ) : (
            <>
              Continue
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

async function saveSecrets(
  projectId: string,
  secrets: Record<string, string>
) {
  for (const [key, value] of Object.entries(secrets)) {
    if (!value) continue;
    await fetch(`/api/projects/${projectId}/secrets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
  }
}
