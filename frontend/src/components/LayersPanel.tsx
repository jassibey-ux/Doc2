import { Plane } from 'lucide-react';

interface Layer {
  id: string;
  name: string;
  icon: React.ReactNode;
  count?: number;
  enabled: boolean;
}

interface LayersPanelProps {
  isOpen: boolean;
  layers: Layer[];
  onToggleLayer: (layerId: string) => void;
}

export default function LayersPanel({ isOpen, layers, onToggleLayer }: LayersPanelProps) {
  return (
    <div className={`layers-panel ${!isOpen ? 'hidden' : ''}`}>
      <div className="layers-panel-header">
        <h3>Layers</h3>
      </div>
      <div className="layers-panel-content">
        {layers.map(layer => (
          <div
            key={layer.id}
            className={`layer-item ${layer.enabled ? 'active' : ''}`}
            onClick={() => onToggleLayer(layer.id)}
          >
            <div className="layer-info">
              <div className="layer-icon">
                {layer.icon}
              </div>
              <span className="layer-name">{layer.name}</span>
            </div>
            <div className="flex items-center gap-3">
              {layer.count !== undefined && (
                <span className="layer-count">{layer.count}</span>
              )}
              <div className={`toggle-switch ${layer.enabled ? 'active' : ''}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Default layers configuration
export function useDefaultLayers(droneCount: number) {
  return [
    {
      id: 'drones',
      name: 'Drones',
      icon: <Plane size={16} />,
      count: droneCount,
      enabled: true,
    },
  ];
}
