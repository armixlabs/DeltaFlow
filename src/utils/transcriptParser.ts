export async function parseTranscriptFile(file: File): Promise<string> {
  const text = await file.text();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

  switch (extension) {
    case 'vtt':
      return parseVtt(text);
    case 'csv':
      return parseCsv(text);
    case 'txt':
    default:
      return text.trim();
  }
}

function parseVtt(content: string): string {
  const lines = content
    .replace(/^WEBVTT[^\n]*\n?/i, '')
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const transcript: string[] = [];

  for (const block of lines) {
    const parts = block.split(/\r?\n/).filter(Boolean);
    if (parts.length === 0) continue;

    // Remove cue identifiers (numeric or UUID based)
    if (/^\d+$/.test(parts[0]) || /[a-f0-9-]+\/\d+-\d+/i.test(parts[0])) {
      parts.shift();
    }

    // Remove timestamp line
    if (parts.length > 0 && /-->/.test(parts[0])) {
      parts.shift();
    }

    if (parts.length === 0) continue;

    const normalizedParts = parts.map((part) =>
      part.replace(/<v\s+([^>]+)>([\s\S]*?)<\/v>/gi, (_match, speaker, body) => {
        const speakerName = String(speaker).trim();
        const bodyText = String(body).replace(/\s+/g, ' ').trim();
        return speakerName ? `${speakerName}: ${bodyText}` : bodyText;
      })
    );

    const text = normalizedParts.join(' ').replace(/\s+/g, ' ').trim();
    if (text) {
      transcript.push(text);
    }
  }

  return transcript.join('\n');
}

function parseCsv(content: string): string {
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const transcript: string[] = [];

  for (const row of rows) {
    const segments = row.split(/;|,/).map((segment) => segment.trim()).filter(Boolean);

    if (segments.length === 0) {
      continue;
    }

    if (segments.length === 3) {
      const [, speaker, text] = segments;
      transcript.push(`${speaker}: ${text}`);
    } else if (segments.length === 2) {
      const [first, second] = segments;
      // Heuristic: if first looks like a timestamp, treat second as speaker/text
      if (/^\d{1,2}:\d{2}/.test(first)) {
        transcript.push(second);
      } else {
        transcript.push(`${first}: ${second}`);
      }
    } else {
      transcript.push(segments.join(' '));
    }
  }

  return transcript.join('\n');
}
