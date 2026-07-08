/** Game UI helpers — use ForceText inside Button; never put key on DOM nodes */

import { ForceText } from './ForceText';

const api = window.SubwayBuilderAPI;
const { Button } = api.utils.components as Record<string, React.ComponentType<any>>;

interface LabeledButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
}

export function LabeledButton({
  label,
  onClick,
  variant = 'secondary',
}: LabeledButtonProps) {
  return (
    <Button variant={variant} onClick={onClick}>
      <ForceText text={label} />
    </Button>
  );
}
