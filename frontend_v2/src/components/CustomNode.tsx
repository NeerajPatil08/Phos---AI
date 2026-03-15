import { Handle, Position } from '@xyflow/react';

export type CustomNodeData = {
  label: string;
  nodeType: 'drug' | 'enzyme' | 'symptom' | 'pathway';
};

const typeConfig = {
  drug: {
    bg: 'from-blue-600 to-indigo-600',
    border: 'border-blue-400/50',
    glow: 'shadow-blue-500/40',
    icon: '💊',
  },
  enzyme: {
    bg: 'from-amber-500 to-orange-600',
    border: 'border-amber-400/50',
    glow: 'shadow-amber-500/40',
    icon: '⚗️',
  },
  symptom: {
    bg: 'from-red-700 to-rose-700',
    border: 'border-red-500/50',
    glow: 'shadow-red-500/40',
    icon: '⚠️',
  },
  pathway: {
    bg: 'from-teal-600 to-cyan-600',
    border: 'border-teal-400/50',
    glow: 'shadow-teal-500/40',
    icon: '🔬',
  },
};

export function CustomNode({ data }: { data: CustomNodeData }) {
  const cfg = typeConfig[data.nodeType] || typeConfig.pathway;

  return (
    <div
      className={`
        relative rounded-xl border backdrop-blur-sm px-4 py-3 min-w-[120px] text-center
        bg-gradient-to-br ${cfg.bg} ${cfg.border}
        shadow-lg ${cfg.glow}
        transition-all duration-300 hover:scale-105 hover:shadow-xl
        cursor-pointer
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/30 !border-white/20 !w-2 !h-2" />
      <div className="flex items-center justify-center gap-2">
        <span className="text-base">{cfg.icon}</span>
        <span className="text-sm font-bold text-white drop-shadow-sm">{data.label}</span>
      </div>
      <div className="absolute inset-0 rounded-xl bg-white/5 pointer-events-none" />
      <Handle type="source" position={Position.Bottom} className="!bg-white/30 !border-white/20 !w-2 !h-2" />
    </div>
  );
}
