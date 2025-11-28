import { useState, useEffect } from 'react';
import * as api from './api';
import type { EnvVar, Snippet } from './api';

type Tab = 'env' | 'snippets';

export default function App() {
  const [tab, setTab] = useState<Tab>('env');

  return (
    <div className="app">
      <header>
        <h1>bun-runner-mcp</h1>
        <nav>
          <button
            className={tab === 'env' ? 'active' : ''}
            onClick={() => setTab('env')}
          >
            Environment Variables
          </button>
          <button
            className={tab === 'snippets' ? 'active' : ''}
            onClick={() => setTab('snippets')}
          >
            Snippets
          </button>
        </nav>
      </header>
      <main>
        {tab === 'env' ? <EnvVarsPanel /> : <SnippetsPanel />}
      </main>
    </div>
  );
}

function EnvVarsPanel() {
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingVar, setEditingVar] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formValue, setFormValue] = useState('');
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadEnvVars();
  }, []);

  async function loadEnvVars() {
    try {
      setLoading(true);
      setError(null);
      const vars = await api.getEnvVars();
      setEnvVars(vars);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setError(null);
      if (editingVar) {
        await api.updateEnvVar(editingVar, formValue);
      } else {
        await api.createEnvVar(formName, formValue);
      }
      setShowForm(false);
      setEditingVar(null);
      setFormName('');
      setFormValue('');
      await loadEnvVars();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete ${name}?`)) return;
    try {
      setError(null);
      await api.deleteEnvVar(name);
      await loadEnvVars();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  function startEdit(envVar: EnvVar) {
    setEditingVar(envVar.name);
    setFormName(envVar.name);
    setFormValue(envVar.value);
    setShowForm(true);
  }

  function startAdd() {
    setEditingVar(null);
    setFormName('');
    setFormValue('');
    setShowForm(true);
  }

  function toggleShowValue(name: string) {
    setShowValues((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Environment Variables</h2>
        <button className="primary" onClick={startAdd}>
          + Add Variable
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {showForm && (
        <div className="form-overlay">
          <div className="form">
            <h3>{editingVar ? 'Edit Variable' : 'Add Variable'}</h3>
            <label>
              Name
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={!!editingVar}
                placeholder="MY_VAR"
              />
            </label>
            <label>
              Value
              <textarea
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder="value"
                rows={3}
              />
            </label>
            <div className="form-actions">
              <button onClick={() => setShowForm(false)}>Cancel</button>
              <button className="primary" onClick={handleSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {envVars.length === 0 ? (
        <div className="empty">
          No environment variables configured.
          <br />
          Click "Add Variable" to create one.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Value</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {envVars.map((env) => (
              <tr key={env.name}>
                <td className="name">{env.name}</td>
                <td className="value">
                  <code>
                    {showValues[env.name] ? env.value : '••••••••'}
                  </code>
                  <button
                    className="small"
                    onClick={() => toggleShowValue(env.name)}
                  >
                    {showValues[env.name] ? 'Hide' : 'Show'}
                  </button>
                </td>
                <td className="actions">
                  <button onClick={() => startEdit(env)}>Edit</button>
                  <button className="danger" onClick={() => handleDelete(env.name)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SnippetsPanel() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSnippet, setSelectedSnippet] = useState<Snippet | null>(null);

  useEffect(() => {
    loadSnippets();
  }, []);

  async function loadSnippets() {
    try {
      setLoading(true);
      setError(null);
      const list = await api.getSnippets();
      setSnippets(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function viewSnippet(name: string) {
    try {
      setError(null);
      const snippet = await api.getSnippet(name);
      setSelectedSnippet(snippet);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load snippet');
    }
  }

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Code Snippets</h2>
        <span className="hint">
          Snippets are managed via MCP tools (save_snippet, delete_snippet)
        </span>
      </div>

      {error && <div className="error">{error}</div>}

      {selectedSnippet && (
        <div className="form-overlay">
          <div className="form snippet-view">
            <h3>{selectedSnippet.name}</h3>
            <p className="description">{selectedSnippet.description}</p>
            <pre className="code">{selectedSnippet.code}</pre>
            <div className="form-actions">
              <button onClick={() => setSelectedSnippet(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {snippets.length === 0 ? (
        <div className="empty">
          No snippets saved.
          <br />
          Use the save_snippet MCP tool to create snippets.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {snippets.map((snippet) => (
              <tr key={snippet.name}>
                <td className="name">{snippet.name}</td>
                <td className="description">{snippet.description}</td>
                <td className="actions">
                  <button onClick={() => viewSnippet(snippet.name)}>
                    View Code
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
