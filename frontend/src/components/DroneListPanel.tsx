import { Search, Plane, Battery, MapPin } from 'lucide-react';
import { useState, useMemo } from 'react';
import { StatusDot, Badge, GlassInput } from './ui/GlassUI';
import { GPSHealthBadge, FleetGPSHealthWidget } from './GPSHealthIndicator';
import type { DroneSummary } from '../types/drone';

interface DroneListPanelProps {
  isOpen: boolean;
  drones: Map<string, DroneSummary>;
  selectedDroneId: string | null;
  onSelectDrone: (droneId: string) => void;
}

export default function DroneListPanel({
  isOpen,
  drones,
  selectedDroneId,
  onSelectDrone,
}: DroneListPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter and sort drones
  const sortedDrones = useMemo(() => {
    const droneList = Array.from(drones.values());

    // Filter by search query
    const filtered = searchQuery
      ? droneList.filter(d =>
          d.tracker_id.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : droneList;

    // Sort: active first, then by ID
    return filtered.sort((a, b) => {
      // Stale drones at the bottom
      if (a.is_stale !== b.is_stale) {
        return a.is_stale ? 1 : -1;
      }
      // Then by tracker ID
      return a.tracker_id.localeCompare(b.tracker_id, undefined, { numeric: true });
    });
  }, [drones, searchQuery]);

  // Count stats
  const activeCount = Array.from(drones.values()).filter(d => !d.is_stale).length;
  const staleCount = drones.size - activeCount;

  // GPS health stats
  const gpsStats = useMemo(() => {
    let healthy = 0;
    let degraded = 0;
    let lost = 0;
    for (const drone of drones.values()) {
      const status = drone.gps_health?.health_status ?? 'healthy';
      if (status === 'healthy') healthy++;
      else if (status === 'degraded') degraded++;
      else lost++;
    }
    return { healthy, degraded, lost };
  }, [drones]);

  // Format coordinates for display
  const formatCoords = (lat: number | null, lon: number | null): string => {
    if (lat === null || lon === null) return 'No position';
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  };

  // Format age
  const formatAge = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  return (
    <div className={`side-panel ${!isOpen ? 'hidden' : ''}`}>
      {/* Header */}
      <div className="side-panel-header">
        <h2>
          <Plane size={20} className="inline mr-2 text-indigo-400" />
          Drones
        </h2>
        <div className="flex gap-2 items-center">
          <Badge color="green" size="md">{activeCount} Active</Badge>
          {staleCount > 0 && (
            <Badge color="red" size="md">{staleCount} Stale</Badge>
          )}
          {/* GPS health summary */}
          {(gpsStats.degraded > 0 || gpsStats.lost > 0) && (
            <FleetGPSHealthWidget
              healthyCounts={gpsStats.healthy}
              degradedCount={gpsStats.degraded}
              lostCount={gpsStats.lost}
              compact
            />
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-white/8">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <GlassInput
            placeholder="Search drones..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label="Search drones"
          />
        </div>
      </div>

      {/* Drone List */}
      <div className="side-panel-content">
        {sortedDrones.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Plane size={28} />
            </div>
            <h3>No Drones Found</h3>
            <p>
              {searchQuery
                ? 'No drones match your search'
                : 'Waiting for drone telemetry data...'}
            </p>
          </div>
        ) : (
          <div className="drone-list">
            {sortedDrones.map(drone => (
              <div
                key={drone.tracker_id}
                className={`drone-list-item ${
                  selectedDroneId === drone.tracker_id ? 'selected' : ''
                } ${drone.is_stale ? 'stale' : ''} ${drone.low_battery ? 'low-battery' : ''}`}
                onClick={() => onSelectDrone(drone.tracker_id)}
              >
                <StatusDot
                  status={drone.is_stale ? 'offline' : 'online'}
                  pulse={!drone.is_stale}
                />
                <div className="drone-info">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="drone-id">#{drone.tracker_id}</span>
                    {drone.is_stale && (
                      <Badge color="red" size="sm">
                        <MapPin size={10} className="inline mr-1" />
                        LOST
                      </Badge>
                    )}
                    {drone.battery_critical && (
                      <Badge color="red" size="sm">
                        <Battery size={10} className="inline mr-1" />
                        CRITICAL
                      </Badge>
                    )}
                    {drone.low_battery && !drone.battery_critical && (
                      <Badge color="yellow" size="sm">
                        <Battery size={10} className="inline mr-1" />
                        LOW BAT
                      </Badge>
                    )}
                    {/* GPS Health badge - replaces simple fix_valid check */}
                    {drone.gps_health && !drone.is_stale && (
                      <GPSHealthBadge health={drone.gps_health} />
                    )}
                    {/* Fallback for drones without gps_health */}
                    {!drone.gps_health && !drone.fix_valid && !drone.is_stale && (
                      <Badge color="yellow" size="sm">No Fix</Badge>
                    )}
                  </div>
                  <span className="drone-coords">
                    {drone.is_stale && drone.last_known_lat && drone.last_known_lon
                      ? `Last: ${formatCoords(drone.last_known_lat, drone.last_known_lon)}`
                      : formatCoords(drone.lat, drone.lon)}
                  </span>
                  {drone.is_stale && (
                    <span className="drone-stale-time">
                      Lost {formatAge(drone.age_seconds)}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  {!drone.is_stale && (
                    <span className="text-xs text-white/40">
                      {formatAge(drone.age_seconds)}
                    </span>
                  )}
                  {drone.rssi_dbm !== null && (
                    <div className="text-xs text-white/50 mt-1">
                      {drone.rssi_dbm} dBm
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
