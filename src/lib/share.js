// Partage ou téléchargement d'un fichier (PDF, tableur, fichier d'équipe).
import { toast } from '../ui/ui.jsx';

export async function shareFile(filename, content, type, title = filename) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const file = new File([blob], filename, { type });
  try {
    if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
  } catch (e) {
    if (e.name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`${filename} téléchargé`);
  return 'downloaded';
}

export async function shareText(text, title = 'Nokk') {
  try {
    if (navigator.share) { await navigator.share({ text, title }); return true; }
  } catch (e) { if (e.name === 'AbortError') return false; }
  try { await navigator.clipboard.writeText(text); toast('Texte copié'); return true; } catch { return false; }
}
