import React, { useEffect, useMemo, useState } from 'react';
import { getEnvVar, getConfigOverrides, setConfigOverride } from '../utils/env';

type ConfigField = {
  key: string;
  label: string;
  required?: boolean;
  type?: 'password' | 'text';
};

const CONFIG_FIELDS: ConfigField[] = [
  { key: 'ADO_REST_HOST', label: 'ADONIS Host', required: true },
  { key: 'ADO_REST_IDENTIFIER', label: 'ADONIS Identifier' },
  { key: 'ADO_REST_SECRET', label: 'ADONIS Secret', type: 'password' },
  { key: 'ADO_REST_REPO', label: 'ADONIS Repository ID', required: true },
  { key: 'ADO_REST_ROOTMODELGROUP', label: 'ADONIS Root Model Group', required: true },
  { key: 'API_KEY', label: 'Google Gemini API Key', type: 'password' },
  { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', type: 'password' },
  { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', type: 'password' },
];

interface ConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  missingKeys?: string[];
}

const readInitialValues = (): Record<string, string> => {
  const overrides = getConfigOverrides();
  const values: Record<string, string> = {};
  CONFIG_FIELDS.forEach(({ key }) => {
    values[key] = overrides[key] ?? getEnvVar(key) ?? '';
  });
  return values;
};

export const ConfigDialog: React.FC<ConfigDialogProps> = ({ isOpen, onClose, onSaved, missingKeys }) => {
  const [formValues, setFormValues] = useState<Record<string, string>>(readInitialValues);
  const [error, setError] = useState<string | null>(null);

  const requiredKeys = useMemo(() => CONFIG_FIELDS.filter((field) => field.required).map((field) => field.key), []);

  useEffect(() => {
    if (isOpen) {
      setFormValues(readInitialValues());
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    for (const key of requiredKeys) {
      if (!formValues[key] || !formValues[key].trim()) {
        setError(`Please provide a value for ${key}.`);
        return;
      }
    }

    CONFIG_FIELDS.forEach(({ key }) => {
      const value = formValues[key]?.trim();
      setConfigOverride(key, value || undefined);
    });

    setError(null);
    onSaved();
  };

  return (
    <div className="config-dialog-overlay" role="dialog" aria-modal="true">
      <div className="config-dialog">
        <header className="config-dialog__header">
          <h2>Configuration</h2>
          <button className="config-dialog__close" onClick={onClose} aria-label="Close configuration dialog">
            ×
          </button>
        </header>

        {missingKeys && missingKeys.length > 0 && (
          <div className="config-dialog__notice" role="alert">
            <strong>Missing values:</strong>
            <ul>
              {missingKeys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="config-dialog__content">
          {CONFIG_FIELDS.map(({ key, label, required, type }) => (
            <label key={key} className="config-dialog__field">
              <span>
                {label}
                {required && <span className="config-dialog__required">*</span>}
              </span>
              <input
                type={type === 'password' ? 'password' : 'text'}
                value={formValues[key] ?? ''}
                onChange={(event) => handleChange(key, event.target.value)}
                placeholder={`Enter ${label}`}
              />
            </label>
          ))}
        </div>

        {error && <p className="config-dialog__error">{error}</p>}

        <footer className="config-dialog__footer">
          <button className="config-dialog__button config-dialog__button--secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="config-dialog__button config-dialog__button--primary" onClick={handleSave}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
};

export const REQUIRED_CONFIG_KEYS = CONFIG_FIELDS.filter((field) => field.required).map((field) => field.key);
