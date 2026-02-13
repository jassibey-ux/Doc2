"""Data models for LogTail Dashboard."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TrackerRecord(BaseModel):
    """Normalized tracker data record."""

    tracker_id: str = Field(..., description="Tracker identifier")
    time_local_received: datetime = Field(..., description="Local time when record was received")
    time_gps: Optional[datetime] = Field(None, description="GPS timestamp from device")
    time_received: Optional[datetime] = Field(None, description="Time when message was received (for latency calc)")
    lat: Optional[float] = Field(None, description="Latitude in decimal degrees")
    lon: Optional[float] = Field(None, description="Longitude in decimal degrees")
    alt_m: Optional[float] = Field(None, description="Altitude in meters")
    speed_mps: Optional[float] = Field(None, description="Speed in meters per second")
    course_deg: Optional[float] = Field(None, description="Course in degrees")
    hdop: Optional[float] = Field(None, description="Horizontal dilution of precision")
    satellites: Optional[int] = Field(None, description="Number of satellites in view")
    rssi_dbm: Optional[float] = Field(None, description="RSSI in dBm")
    baro_alt_m: Optional[float] = Field(None, description="Barometric altitude in meters")
    baro_temp_c: Optional[float] = Field(None, description="Barometric temperature in Celsius")
    baro_press_hpa: Optional[float] = Field(None, description="Barometric pressure in hPa")
    fix_valid: bool = Field(default=False, description="GPS fix validity")
    battery_mv: Optional[float] = Field(None, description="Battery voltage in millivolts (SD card format)")
    latency_ms: Optional[float] = Field(None, description="Transmission latency in milliseconds")

    @property
    def timestamp(self) -> datetime:
        """Alias for time_local_received for convenience."""
        return self.time_local_received


class TrackerState(BaseModel):
    """Current state of a tracker."""

    tracker_id: str
    time_local_received: datetime
    time_gps: Optional[datetime] = None
    time_received: Optional[datetime] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    alt_m: Optional[float] = None
    speed_mps: Optional[float] = None
    course_deg: Optional[float] = None
    hdop: Optional[float] = None
    satellites: Optional[int] = None
    rssi_dbm: Optional[float] = None
    baro_alt_m: Optional[float] = None
    baro_temp_c: Optional[float] = None
    baro_press_hpa: Optional[float] = None
    fix_valid: bool = False
    is_stale: bool = False
    age_seconds: float = 0.0
    battery_mv: Optional[float] = None
    latency_ms: Optional[float] = None

    # Last Known Location tracking
    last_known_lat: Optional[float] = None
    last_known_lon: Optional[float] = None
    last_known_alt_m: Optional[float] = None
    last_known_time: Optional[datetime] = None
    stale_since: Optional[datetime] = None

    # Battery status
    low_battery: bool = False
    battery_critical: bool = False

    class Config:
        """Pydantic config."""
        json_encoders = {
            datetime: lambda v: v.isoformat(),
        }


class TrackerSummary(BaseModel):
    """Summary information for tracker list."""

    tracker_id: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    alt_m: Optional[float] = None
    rssi_dbm: Optional[float] = None
    hdop: Optional[float] = None
    satellites: Optional[int] = None
    fix_valid: bool = False
    is_stale: bool = False
    age_seconds: float = 0.0
    last_update: datetime
    battery_mv: Optional[float] = None

    # Last Known Location tracking
    last_known_lat: Optional[float] = None
    last_known_lon: Optional[float] = None
    last_known_alt_m: Optional[float] = None
    last_known_time: Optional[datetime] = None
    stale_since: Optional[datetime] = None

    # Battery status
    low_battery: bool = False
    battery_critical: bool = False

    class Config:
        """Pydantic config."""
        json_encoders = {
            datetime: lambda v: v.isoformat(),
        }


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "ok"
    version: str
    active_event: Optional[str] = None
    tracker_count: int = 0
    uptime_seconds: float = 0.0


class EventListResponse(BaseModel):
    """List of available event folders."""

    events: list[str]


class ActiveEventRequest(BaseModel):
    """Request to set active event."""

    event_name: Optional[str] = None


class ActiveEventResponse(BaseModel):
    """Response after setting active event."""

    success: bool
    event_name: Optional[str] = None
    message: str


class WebSocketMessage(BaseModel):
    """WebSocket message format."""

    type: str  # tracker_updated, tracker_stale, active_event_changed, backend_status
    data: dict

    class Config:
        """Pydantic config."""
        json_encoders = {
            datetime: lambda v: v.isoformat(),
        }
