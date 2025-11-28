// API client for bun-runner-mcp web UI

export interface EnvVar {
  name: string;
  value: string;
}

export interface Snippet {
  name: string;
  description: string;
  code?: string;
}

// Environment Variables API

export async function getEnvVars(): Promise<EnvVar[]> {
  const res = await fetch('/api/env');
  if (!res.ok) throw new Error('Failed to fetch env vars');
  const data = await res.json();
  return data.envVars;
}

export async function createEnvVar(name: string, value: string): Promise<EnvVar> {
  const res = await fetch('/api/env', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, value }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to create env var');
  }
  const data = await res.json();
  return data.envVar;
}

export async function updateEnvVar(name: string, value: string): Promise<EnvVar> {
  const res = await fetch(`/api/env/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to update env var');
  }
  const data = await res.json();
  return data.envVar;
}

export async function deleteEnvVar(name: string): Promise<void> {
  const res = await fetch(`/api/env/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to delete env var');
  }
}

// Snippets API

export async function getSnippets(): Promise<Snippet[]> {
  const res = await fetch('/api/snippets');
  if (!res.ok) throw new Error('Failed to fetch snippets');
  const data = await res.json();
  return data.snippets;
}

export async function getSnippet(name: string): Promise<Snippet> {
  const res = await fetch(`/api/snippets/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error('Snippet not found');
  return await res.json();
}
