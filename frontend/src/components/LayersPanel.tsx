import { Plane, Trash2, FileDown } from 'lucide-react';
import type { ImportedLayer } from './MapFileDropHandler';

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
  importedLayers?: ImportedLayer[];
  onToggleImportedLayer?: (layerId: string) => void;
  onRemoveImportedLayer?: (layerId: string) => void;
}

const IMPORT_COLORS = ['#06b6d4', '#d946ef', '#84cc16', '#f97316', '#a855f7', '#14b8a6', '#f43f5e', '#6366f1'];

export default function LayersPanel({
  isOpen,
  layers,
  onToggleLayer,
  importedLayers = [],
  onToggleImportedLayer,
  onRemoveImportedLayer,
}: LayersPanelProps) {
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

        {/* Imported Layers Section */}
        {importedLayers.length > 0 && (
          <>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'rgba(255,255,255,0.4)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                padding: '12px 12px 4px',
              }}
            >
              Imported
            </div>
            {importedLayers.map((layer, idx) => (
              <div
                key={layer.id}
                className={`layer-item ${layer.visible ? 'active' : ''}`}
                onClick={() => onToggleImportedLayer?.(layer.id)}
              >
                <div className="layer-info">
                  <div className="layer-icon">
                    <FileDown size={16} style={{ color: IMPORT_COLORS[idx % IMPORT_COLORS.length] }} />
                  </div>
                  <span className="layer-name">{layer.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveImportedLayer?.(layer.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(255,255,255,0.3)',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title="Remove layer"
                  >
                    <Trash2 size={14} />
                  </button>
                  <div className={`toggle-switch ${layer.visible ? 'active' : ''}`} />
                </div>
              </div>
            ))}
          </>
        )}
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
