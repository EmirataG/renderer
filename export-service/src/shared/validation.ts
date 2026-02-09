import { Value } from '@sinclair/typebox/value';
import { ExportSettingsSchema } from './exportSettings.js';

/**
 * Validate export settings against the TypeBox schema.
 * Returns an array of error messages (empty if valid).
 */
export function validateExportSettings(settings: unknown): string[] {
  const errors: string[] = [];

  if (!Value.Check(ExportSettingsSchema, settings)) {
    const schemaErrors = [...Value.Errors(ExportSettingsSchema, settings)];
    for (const err of schemaErrors) {
      errors.push(`${err.path}: ${err.message}`);
    }
  }

  return errors;
}

/**
 * Validate sync anchors (serialized from Map<string, number> via Object.fromEntries()).
 * Checks structure, non-emptiness, and value types.
 * Returns an array of error messages (empty if valid).
 */
export function validateSyncAnchors(anchors: unknown): string[] {
  const errors: string[] = [];

  if (typeof anchors !== 'object' || anchors === null) {
    errors.push('syncAnchors must be an object');
    return errors;
  }

  if (Array.isArray(anchors)) {
    errors.push('syncAnchors must be an object, not an array');
    return errors;
  }

  const entries = Object.entries(anchors as Record<string, unknown>);

  if (entries.length === 0) {
    errors.push(
      'syncAnchors is empty -- ensure Map is serialized with Object.fromEntries()',
    );
    return errors;
  }

  for (const [key, value] of entries) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      errors.push(
        `syncAnchors["${key}"] must be a number, got ${typeof value}`,
      );
    } else if (value < 0) {
      errors.push(`syncAnchors["${key}"] must be non-negative`);
    }
  }

  return errors;
}
