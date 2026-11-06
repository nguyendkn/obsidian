import { parseMarkdown } from '../metadata/parse';

interface ParseRequest {
  id: number;
  path: string;
  text: string;
}

self.onmessage = (event: MessageEvent<ParseRequest>) => {
  const { id, path, text } = event.data;
  try {
    const metadata = parseMarkdown(text);
    (self as unknown as Worker).postMessage({ id, path, metadata });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, path, error: String(err) });
  }
};
