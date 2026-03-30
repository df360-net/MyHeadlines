import { formatDistanceToNow } from 'date-fns';

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return '';
  }
}

export function parseTopics(topicsJson: string): string[] {
  try {
    const parsed = JSON.parse(topicsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
