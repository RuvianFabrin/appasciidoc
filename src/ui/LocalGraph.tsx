import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { backlinksFor, outNeighbors } from '../workspace/links';
import { baseName, type NoteInfo } from '../workspace/api';

interface Props {
  notes: NoteInfo[];
  activeFile: string | null;
  onOpen: (path: string) => void;
}

interface Node {
  path: string;
  title: string;
  dir: 'in' | 'out';
}

/** Mini-grafo "vizinhos" da nota atual — SVG puro, sem libs (tarefa 46). */
export function LocalGraph({ notes, activeFile, onOpen }: Props) {
  const { t } = useTranslation();
  const { center, nodes } = useMemo(() => {
    if (!activeFile) return { center: '', nodes: [] as Node[] };
    const self = notes.find((n) => n.path === activeFile);
    const outs = outNeighbors(notes, activeFile).map<Node>((n) => ({ ...n, dir: 'out' }));
    const ins = backlinksFor(notes, activeFile)
      .filter((b) => !outs.some((o) => o.path === b.fromPath))
      .map<Node>((b) => ({ path: b.fromPath, title: b.fromTitle, dir: 'in' }));
    return {
      center: self?.title || baseName(activeFile),
      nodes: [...outs, ...ins].slice(0, 10),
    };
  }, [notes, activeFile]);

  if (!activeFile) return <div className="localgraph__empty">{t('graph.empty')}</div>;
  if (nodes.length === 0) return <div className="localgraph__empty">{t('graph.noNeighbors')}</div>;

  const W = 240;
  const H = 150;
  const cx = W / 2;
  const cy = H / 2;
  const r = 58;

  return (
    <svg className="localgraph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('graph.aria')}>
      {nodes.map((n, i) => {
        const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        const label = n.title.length > 14 ? `${n.title.slice(0, 13)}…` : n.title;
        return (
          <g
            key={n.path}
            className={`localgraph__node localgraph__node--${n.dir}`}
            onClick={() => onOpen(n.path)}
          >
            <line x1={cx} y1={cy} x2={x} y2={y} className="localgraph__edge" />
            <circle cx={x} cy={y} r={4} />
            <text x={x} y={y - 7} textAnchor="middle">
              {label}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={5} className="localgraph__center" />
      <text x={cx} y={cy + 16} textAnchor="middle" className="localgraph__center-label">
        {center.length > 16 ? `${center.slice(0, 15)}…` : center}
      </text>
    </svg>
  );
}
