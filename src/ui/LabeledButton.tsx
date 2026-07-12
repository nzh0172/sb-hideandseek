/** Game UI helpers — use ForceText inside Button; never put key on DOM nodes */

import { ForceText } from './ForceText';

const api = window.SubwayBuilderAPI;
const { Button } = api.utils.components as Record<string, React.ComponentType<any>>;

interface LabeledButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  style?: React.CSSProperties;
}

export function LabeledButton({
  label,
  onClick,
  variant = 'secondary',
  style,
}: LabeledButtonProps) {
  return (
    <Button variant={variant} onClick={onClick} style={style}>
      <ForceText text={label} />
    </Button>
  );
}
