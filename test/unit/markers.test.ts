import { describe, expect, it } from 'vitest';
import { extractFindingId, findingMarker, neutralizeMarkerSyntax, sanitizeAiText, SUMMARY_MARKER } from '../../src/github/markers.js';

describe('findingMarker / extractFindingId', () => {
  it('round-trips an id through the marker format', () => {
    expect(extractFindingId(findingMarker('abc123'))).toBe('abc123');
  });

  it('returns null when no marker is present', () => {
    expect(extractFindingId('just a normal comment')).toBeNull();
  });
});

describe('neutralizeMarkerSyntax', () => {
  it('neutralizes an attempted finding-marker forgery', () => {
    const forged = neutralizeMarkerSyntax(findingMarker('attacker-chosen-id'));
    expect(extractFindingId(forged)).toBeNull();
  });

  it('neutralizes an attempted summary-marker forgery', () => {
    const forged = neutralizeMarkerSyntax(SUMMARY_MARKER);
    expect(forged).not.toContain(SUMMARY_MARKER);
  });

  it('leaves ordinary text completely unchanged', () => {
    const text = 'The response status is never checked, which could hide a regression.';
    expect(neutralizeMarkerSyntax(text)).toBe(text);
  });
});

describe('sanitizeAiText', () => {
  it('neutralizes marker syntax within otherwise-normal finding text', () => {
    const maliciousTitle = `Normal-looking title ${findingMarker('forged-id')} more text`;
    const sanitized = sanitizeAiText(maliciousTitle);
    expect(extractFindingId(sanitized)).toBeNull();
  });

  it('truncates text far beyond the length cap', () => {
    const huge = 'x'.repeat(10_000);
    const sanitized = sanitizeAiText(huge);
    expect(sanitized.length).toBeLessThan(huge.length);
    expect(sanitized).toContain('[truncated]');
  });

  it('leaves short, ordinary text untouched', () => {
    const text = 'A concise, normal finding description.';
    expect(sanitizeAiText(text)).toBe(text);
  });
});
