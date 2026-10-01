/**
 * Ícone da UI via Material Symbols (fonte variável embutida — tarefa 69).
 * Sem SVG solto por ícone: o `name` é a ligadura do Material Symbols
 * (ex.: "folder_open", "refresh", "close"). Peso e preenchimento configuráveis
 * pelos eixos `wght` e `FILL` da fonte.
 */
interface Props {
  name: string;
  /** Tamanho em px (também é o tamanho da caixa). Padrão 20. */
  size?: number;
  /** Peso do traço, 100–700. Padrão 400. */
  weight?: number;
  /** Ícone preenchido (eixo FILL). Padrão false. */
  fill?: boolean;
  className?: string;
  /** Se definido, o ícone é anunciado (role="img"); senão fica decorativo. */
  title?: string;
}

export function Icon({ name, size = 20, weight = 400, fill = false, className, title }: Props) {
  return (
    <span
      className={'icon' + (className ? ` ${className}` : '')}
      style={{
        fontSize: `${size}px`,
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}`,
      }}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      {name}
    </span>
  );
}
